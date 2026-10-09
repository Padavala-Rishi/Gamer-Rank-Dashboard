import type { PGlite, Transaction } from "@electric-sql/pglite";
import { BOOTSTRAP_SQL, LOCAL_USER_ID } from "./bootstrap";
import { MIGRATIONS } from "./migrations.generated";

export type Executor = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** Open (or create) the database. `dataDir` is "idb://name" in the browser; omit it for a throwaway in-memory database. */
export async function openDatabase(dataDir?: string): Promise<PGlite> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  await prepare(db);
  return db;
}

/** Bootstrap, apply any migrations not yet applied, and make sure the local user (and so its profile + settings) exists. */
export async function prepare(db: PGlite): Promise<void> {
  await db.exec(BOOTSTRAP_SQL);
  const done = new Set((await db.query<{ name: string }>("select name from _lu.migrations")).rows.map((r) => r.name));
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("insert into _lu.migrations (name) values ($1)", [m.name]);
    });
  }
  await db.query("insert into auth.users (id, email) values ($1, 'local@device') on conflict do nothing", [LOCAL_USER_ID]);
}

const CLAIMS = JSON.stringify({ sub: LOCAL_USER_ID, role: "authenticated" });

/** Runs each statement the way PostgREST would: its own transaction, as the `authenticated` role, with the user's claims set. */
export function userExecutor(db: PGlite): Executor {
  return (sql, params) =>
    db.transaction(async (tx: Transaction) => {
      await tx.exec(`set local role authenticated; select set_config('request.jwt.claims', '${CLAIMS}', true);`);
      const r = await tx.query<Record<string, unknown>>(sql, params as unknown[]);
      return { rows: r.rows };
    });
}
