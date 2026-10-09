import pg from "pg";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:54322/levelup";

/** Superuser pool: used only for arranging data (creating users, back-dating rows). */
export const admin = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

let n = 0;
export async function createUser(tz = "UTC"): Promise<string> {
  const email = `user${Date.now()}_${n++}_${Math.random().toString(36).slice(2, 7)}@test.local`;
  const { rows } = await admin.query("insert into auth.users (email) values ($1) returning id", [email]);
  await admin.query("update profiles set timezone=$2 where id=$1", [rows[0].id, tz]);
  return rows[0].id;
}

export type Tx = {
  q: <T = any>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>;
};

/**
 * Run `fn` the way PostgREST would for a signed-in user: one transaction, `set local role authenticated`
 * and the JWT claims in request.jwt.claims. `anon` simulates a request without a session.
 */
export async function asUser<T>(uid: string | null, fn: (tx: Tx) => Promise<T>, opts: { commit?: boolean } = {}): Promise<T> {
  const client = await admin.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${uid ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(uid ? { sub: uid, role: "authenticated" } : { role: "anon" })]);
    const out = await fn({ q: (sql, params) => client.query(sql, params as any[]) as any });
    await client.query(opts.commit === false ? "rollback" : "commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
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
