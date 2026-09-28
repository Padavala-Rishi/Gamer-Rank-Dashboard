// Authentication: email + password (scrypt), opaque session tokens in HttpOnly cookies.
// Only a SHA-256 hash of each session token is stored, so a leaked database cannot be
// used to hijack sessions.
import { Router, type Request, type RequestHandler } from "express";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { DB } from "./db";
import { newId, nowIso } from "./db";
import { HttpError, userId } from "./http";
import { authSchema, loginSchema } from "../shared/schemas";
import { initializeUser } from "./profile";
import { z } from "zod";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));

const COOKIE = "hos_session";
const SESSION_DAYS = 30;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  const key = await scrypt(password.normalize("NFKC"), salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// A fixed hash lets login spend equal time whether or not the email exists (no user enumeration by timing).
let dummyHash: Promise<string> | null = null;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function sessionCookie(token: string, maxAgeSec: number, secure: boolean): string {
  return [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function createSession(db: DB, uid: string, userAgent?: string): string {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  db.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)").run(
    sha256(token),
    uid,
    now.toISOString(),
    now.toISOString(),
    expires.toISOString(),
    (userAgent ?? "").slice(0, 200),
  );
  return token;
}

/** Attaches req.userId when a valid session cookie is present. Never throws. */
export function sessionMiddleware(db: DB): RequestHandler {
  const find = db.prepare("SELECT id, user_id, expires_at, last_seen_at FROM sessions WHERE id = ?");
  const touch = db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?");
  const remove = db.prepare("DELETE FROM sessions WHERE id = ?");
  return (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token && token.length < 200) {
      const id = sha256(token);
      const row = find.get(id) as { id: string; user_id: string; expires_at: string; last_seen_at: string } | undefined;
      if (row) {
        const now = Date.now();
        if (Date.parse(row.expires_at) <= now) {
          remove.run(id);
        } else {
          (req as Request & { userId?: string; sessionId?: string }).userId = row.user_id;
          (req as Request & { sessionId?: string }).sessionId = id;
          // Sliding expiration, written at most every 10 minutes.
          if (now - Date.parse(row.last_seen_at) > 10 * 60_000) {
            touch.run(new Date(now).toISOString(), new Date(now + SESSION_DAYS * 86_400_000).toISOString(), id);
          }
        }
      }
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  userId(req); // throws 401 when missing
  next();
};

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per process). Good enough for a single-node deployment;
// swap for a shared store if you run several instances.

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}
  check(key: string): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 10_000) this.hits.clear(); // bound memory
    return true;
  }
}

export function authRouter(db: DB, opts: { secureCookies: boolean; authAttemptsPer15Min?: number }): Router {
  const r = Router();
  const authLimiter = new RateLimiter(opts.authAttemptsPer15Min ?? 20, 15 * 60_000);
  const ip = (req: Request) => req.ip ?? "unknown";

  r.post("/register", async (req, res) => {
    if (!authLimiter.check(`reg:${ip(req)}`)) throw new HttpError(429, "Too many attempts. Please wait a few minutes.");
    const { email, password } = authSchema.parse(req.body);
    const tz = typeof req.body?.timezone === "string" ? req.body.timezone : undefined;
    const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
    if (exists) throw new HttpError(409, "An account with this email already exists. Try signing in.");
    const hash = await hashPassword(password);
    const uid = newId();
    db.transaction(() => {
      db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(uid, email, hash, nowIso());
      initializeUser(db, uid, tz);
    })();
    const token = createSession(db, uid, req.headers["user-agent"]);
    res.setHeader("Set-Cookie", sessionCookie(token, SESSION_DAYS * 86400, opts.secureCookies));
    res.status(201).json({ user: { id: uid, email } });
  });

  r.post("/login", async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    if (!authLimiter.check(`login:${ip(req)}`) || !authLimiter.check(`login:${email}`)) {
      throw new HttpError(429, "Too many sign-in attempts. Please wait a few minutes.");
    }
    const user = db.prepare("SELECT id, email, password_hash, failed_logins, locked_until FROM users WHERE email = ?").get(email) as
      | { id: string; email: string; password_hash: string; failed_logins: number; locked_until: string | null }
      | undefined;
    if (!user) {
      dummyHash ??= hashPassword("timing-equalizer-password");
      await verifyPassword(password, await dummyHash);
      throw new HttpError(401, "Email or password is incorrect.");
    }
    if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
      throw new HttpError(429, "This account is temporarily locked after repeated failed sign-ins. Try again in a few minutes.");
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const failed = user.failed_logins + 1;
      const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
      db.prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?").run(lock ? 0 : failed, lock, user.id);
      throw new HttpError(401, "Email or password is incorrect.");
    }
    db.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").run(user.id);
    const token = createSession(db, user.id, req.headers["user-agent"]);
    res.setHeader("Set-Cookie", sessionCookie(token, SESSION_DAYS * 86400, opts.secureCookies));
    res.json({ user: { id: user.id, email: user.email } });
  });

  r.post("/logout", (req, res) => {
    const sid = (req as Request & { sessionId?: string }).sessionId;
    if (sid) db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
    res.setHeader("Set-Cookie", sessionCookie("", 0, opts.secureCookies));
    res.json({ ok: true });
  });

  r.get("/me", (req, res) => {
    const uid = (req as Request & { userId?: string }).userId;
    if (!uid) {
      res.json({ user: null });
      return;
    }
    const user = db.prepare("SELECT id, email, created_at FROM users WHERE id = ?").get(uid);
    res.json({ user: user ?? null });
  });

  r.post("/change-password", requireAuth, async (req, res) => {
    const uid = userId(req);
    const body = z.object({ current: z.string().min(1).max(200), next: authSchema.shape.password }).parse(req.body);
    const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(uid) as { password_hash: string };
    if (!(await verifyPassword(body.current, user.password_hash))) throw new HttpError(400, "Current password is incorrect.");
    const hash = await hashPassword(body.next);
    const sid = (req as Request & { sessionId?: string }).sessionId;
    db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, uid);
      // Sign out every other device.
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(uid, sid ?? "");
    })();
    res.json({ ok: true });
  });

  r.get("/sessions", requireAuth, (req, res) => {
    const uid = userId(req);
    const sid = (req as Request & { sessionId?: string }).sessionId;
    const rows = db
      .prepare("SELECT id, created_at, last_seen_at, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC")
      .all(uid) as { id: string; created_at: string; last_seen_at: string; user_agent: string }[];
    // Never expose session hashes; expose a short handle for revocation instead.
    res.json(rows.map((s) => ({ handle: s.id.slice(0, 12), created_at: s.created_at, last_seen_at: s.last_seen_at, user_agent: s.user_agent, current: s.id === sid })));
  });

  r.post("/sessions/revoke-others", requireAuth, (req, res) => {
    const uid = userId(req);
    const sid = (req as Request & { sessionId?: string }).sessionId ?? "";
    const n = db.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(uid, sid).changes;
    res.json({ revoked: n });
  });

  r.post("/delete-account", requireAuth, async (req, res) => {
    const uid = userId(req);
    const body = z.object({ password: z.string().min(1).max(200), confirm: z.literal("DELETE") }).parse(req.body);
    const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(uid) as { password_hash: string };
    if (!(await verifyPassword(body.password, user.password_hash))) throw new HttpError(400, "Password is incorrect.");
    // ON DELETE CASCADE removes every row owned by the user.
    db.prepare("DELETE FROM users WHERE id = ?").run(uid);
    res.setHeader("Set-Cookie", sessionCookie("", 0, opts.secureCookies));
    res.json({ ok: true });
  });

  return r;
}
