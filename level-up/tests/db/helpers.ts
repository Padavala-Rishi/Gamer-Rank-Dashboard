import { PGlite } from "@electric-sql/pglite";
import { openDatabase } from "@/db/open";

// These tests run the real migrations on the same engine the app ships (Postgres compiled to WebAssembly).
// One in-memory database per test file; `admin` is the superuser used only for arranging data.
export const pg: PGlite = await openDatabase();

type Res<T> = { rows: T[]; rowCount: number };
const shape = <T>(r: { rows: T[]; affectedRows?: number }): Res<T> => ({ rows: r.rows, rowCount: r.affectedRows ? r.affectedRows : r.rows.length });

export const admin = {
  async query<T = any>(sql: string, params: unknown[] = []): Promise<Res<T>> {
    return shape<T>(await pg.query<T>(sql, params));
  },
  async end() { await pg.close(); },
};

let n = 0;
export async function createUser(tz = "UTC"): Promise<string> {
  const email = `user${Date.now()}_${n++}_${Math.random().toString(36).slice(2, 7)}@test.local`;
  const { rows } = await admin.query("insert into auth.users (email) values ($1) returning id", [email]);
  await admin.query("update profiles set timezone=$2 where id=$1", [rows[0].id, tz]);
  return rows[0].id;
}

export type Tx = {
  q: <T = any>(sql: string, params?: unknown[]) => Promise<Res<T>>;
};

class Rollback extends Error {}

/**
 * Run `fn` the way the app does for a signed-in user: one transaction, `set local role authenticated`
 * and the claims in request.jwt.claims. `anon` simulates a request without a session.
 */
export async function asUser<T>(uid: string | null, fn: (tx: Tx) => Promise<T>, opts: { commit?: boolean } = {}): Promise<T> {
  let out!: T;
  try {
    await pg.transaction(async (t) => {
      await t.query(`set local role ${uid ? "authenticated" : "anon"}`);
      await t.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(uid ? { sub: uid, role: "authenticated" } : { role: "anon" })]);
      out = await fn({ q: async (sql, params) => shape(await t.query(sql, (params ?? []) as any[])) });
      if (opts.commit === false) throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

/** Expect the callback to fail and return the Postgres error (code + message). */
export async function failure(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (e: any) {
    return { code: e.code, message: String(e.message) };
  }
  throw new Error("expected the operation to fail, but it succeeded");
}

export async function addTask(uid: string, t: Record<string, unknown> = {}): Promise<string> {
  const row: Record<string, unknown> = { title: "Test quest", difficulty: "easy", category: "basketball", ...t };
  const keys = Object.keys(row);
  return asUser(uid, async (tx) => {
    const { rows } = await tx.q(
      `insert into tasks (${keys.map((k) => `"${k}"`).join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
      keys.map((k) => (typeof row[k] === "object" && row[k] !== null ? JSON.stringify(row[k]) : row[k])),
    );
    return rows[0].id as string;
  });
}

export const complete = (uid: string, id: string, minutes: number | null = null) =>
  asUser(uid, async (tx) => (await tx.q("select complete_task($1,$2) as r", [id, minutes])).rows[0].r);
export const undo = (uid: string, id: string) =>
  asUser(uid, async (tx) => (await tx.q("select undo_task($1) as r", [id])).rows[0].r);
export const summary = (uid: string) =>
  asUser(uid, async (tx) => (await tx.q("select progress_summary() as r")).rows[0].r);
export const ledgerTotal = async (uid: string) =>
  Number((await admin.query("select coalesce(sum(amount),0) s from xp_transactions where user_id=$1", [uid])).rows[0].s);
