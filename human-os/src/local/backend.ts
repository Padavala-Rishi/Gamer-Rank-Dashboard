// On-device backend: the same route modules as the server, running in the browser on a
// SQLite database (sql.js) that is saved to IndexedDB after every change.
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { SqlJsStatic } from "sql.js";
import { BrowserDatabase } from "./sqlite-adapter";
import { createRequest, createResponse, Router, type MiniReq, type MiniRes } from "./mini-express";
import type { DB } from "../../server/db";
import { migrate, newId, nowIso } from "../../server/db";
import { crudRouter } from "../../server/crud";
import { accountRouter } from "../../server/routes/account";
import { domainRouter } from "../../server/routes/domain";
import { insightRouter } from "../../server/routes/insight";
import { errorHandler } from "../../server/http";
import { getProfile, initializeUser, saveProfile } from "../../server/profile";
import { loadDemoData } from "../../server/demo";
import { todayIn } from "../../shared/dates";
import { IS_EMBED } from "../lib/mode";

const IDB_NAME = "human-os";
const STORE = "kv";
const KEY = IS_EMBED ? "preview-db" : "db";

// ---------------------------------------------------------------- IndexedDB (best effort)
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key: string): Promise<Uint8Array | null> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    r.onsuccess = () => resolve((r.result as Uint8Array | undefined) ?? null);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key: string, value: Uint8Array | null): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    if (value) tx.objectStore(STORE).put(value, key);
    else tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------- state
let SQL: SqlJsStatic;
let db: BrowserDatabase;
let userId = "";
let persistent = true;
let lastSavedAt: string | null = null;
let lastTotal = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const tabId = Math.random().toString(36).slice(2);
let channel: BroadcastChannel | null = null;
let api: ReturnType<typeof Router>;

async function saveNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  // export() closes and reopens the connection, which resets PRAGMAs and total_changes().
  const bytes = db.inner.export();
  db.replace(db.inner);
  lastTotal = db.totalChanges();
  if (!persistent) return;
  try {
    await idbSet(KEY, bytes);
    lastSavedAt = nowIso();
    channel?.postMessage({ type: "saved", from: tabId });
  } catch {
    persistent = false;
  }
}

function scheduleSave() {
  if (db.totalChanges() === lastTotal) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), 250);
}

function ensureUser(dbi: DB): string {
  const existing = dbi.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
  if (existing) return existing.id;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const uid = newId();
  dbi.transaction(() => {
    dbi.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(uid, "on-device", "!", nowIso());
    initializeUser(dbi, uid, tz);
    if (IS_EMBED) {
      // The preview opens in a realistic working state, clearly marked as demo data.
      saveProfile(dbi, uid, { ...getProfile(dbi, uid), display_name: "Ravi", onboarded: true });
      loadDemoData(dbi, { db: dbi, userId: uid, tz, today: todayIn(tz), isDemo: true });
    }
  })();
  return uid;
}

function buildApi(dbi: DB) {
  const r = Router();
  r.get("/health", (_req: MiniReq, res: MiniRes) => res.json({ ok: true }));
  r.get("/auth/me", (_req: MiniReq, res: MiniRes) => res.json({ user: { id: userId, email: "This device" } }));
  r.post("/auth/logout", (_req: MiniReq, res: MiniRes) => res.json({ ok: true }));
  r.use((req: MiniReq, _res: MiniRes, next: (e?: unknown) => void) => {
    req.userId = userId;
    next();
  });
  r.get("/local/status", (_req: MiniReq, res: MiniRes) => res.json({ persistent, last_saved_at: lastSavedAt, preview: IS_EMBED }));
  const g = r as unknown as { use: (...a: unknown[]) => void };
  g.use("/r", crudRouter(dbi));
  g.use(accountRouter(dbi));
  g.use(domainRouter(dbi));
  g.use(insightRouter(dbi));
  const ai = Router();
  ai.get("/status", (_req: MiniReq, res: MiniRes) => res.json({ configured: false, enabled: false, model: "", include_journal: false }));
  ai.get("/conversations", (_req: MiniReq, res: MiniRes) => res.json([]));
  ai.get("/context-preview", (_req: MiniReq, res: MiniRes) => res.json({ text: "The on-device version of Human OS has no AI assistant, so nothing is ever sent anywhere." }));
  ai.use((_req: MiniReq, res: MiniRes) => res.status(503).json({ error: "The AI assistant isn't part of the free on-device version." }));
  r.use("/ai", ai);
  return r;
}

async function reloadFromStorage() {
  try {
    const bytes = await idbGet(KEY);
    if (!bytes) return;
    db.replace(new SQL.Database(bytes));
    lastTotal = db.totalChanges();
    window.dispatchEvent(new CustomEvent("hos:data-changed"));
  } catch {
    /* keep the in-memory copy */
  }
}

const ready = (async () => {
  SQL = await initSqlJs();
  let bytes: Uint8Array | null = null;
  try {
    bytes = await idbGet(KEY);
  } catch {
    persistent = false; // private browsing or storage blocked: works, but nothing is kept
  }
  db = new BrowserDatabase(bytes ? new SQL.Database(bytes) : new SQL.Database());
  const dbi = db as unknown as DB;
  migrate(dbi);
  userId = ensureUser(dbi);
  api = buildApi(dbi);
  lastTotal = -1; // force the first save so a new database is stored right away
  scheduleSave();
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* optional */
  }
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("human-os");
    channel.onmessage = (e) => {
      if (e.data?.type === "saved" && e.data.from !== tabId) void reloadFromStorage();
    };
  }
  const flush = () => {
    if (saveTimer) void saveNow();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
})();

export async function request(method: string, path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  await ready;
  const req = createRequest(method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
  const res = createResponse();
  try {
    const handled = await api.handle(req, res, req.path);
    if (!handled) res.status(404).json({ error: "Unknown API endpoint" });
  } catch (err) {
    (errorHandler as unknown as (e: unknown, q: unknown, s: unknown, n: () => void) => void)(err, req, res, () => {});
  }
  scheduleSave();
  return { status: res.statusCode, data: res.body === undefined ? null : JSON.parse(JSON.stringify(res.body)) };
}

/** Deletes everything stored on this device and starts fresh. */
export async function eraseDevice(): Promise<void> {
  await ready;
  if (saveTimer) clearTimeout(saveTimer);
  try {
    await idbSet(KEY, null);
  } catch {
    /* nothing stored */
  }
  channel?.postMessage({ type: "saved", from: tabId });
}
