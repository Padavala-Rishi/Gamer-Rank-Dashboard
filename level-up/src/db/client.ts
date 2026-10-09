import type { PGlite } from "@electric-sql/pglite";
import { IDB_NAME, LOCK_NAME } from "./bootstrap";
import { notifyChange } from "./events";
import { openDatabase, userExecutor } from "./open";
import { makeClient, type DbClient } from "./shim";

export type Supa = DbClient;

/** Thrown when another tab or window of this app already has the on-device database open. */
export class DbLockedError extends Error {
  constructor() { super("Level Up is already open in another tab or window."); this.name = "DbLockedError"; }
}

let opening: Promise<{ pg: PGlite; client: Supa }> | null = null;

/** Only one tab may write to the browser's copy of the database. The lock is held until the tab closes. */
async function takeTabLock(): Promise<void> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return;
  await new Promise<void>((resolve, reject) => {
    void locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (!lock) { reject(new DbLockedError()); return undefined; }
      resolve();
      return new Promise<void>(() => {}); // never settles: hold the lock for the life of the page
    });
  });
}

async function open() {
  const inBrowser = typeof window !== "undefined" && typeof indexedDB !== "undefined";
  if (inBrowser) {
    await takeTabLock();
    void navigator.storage?.persist?.().catch(() => {}); // ask the browser not to evict our data under storage pressure
  }
  const pg = await openDatabase(inBrowser ? IDB_NAME : undefined);
  return { pg, client: makeClient(userExecutor(pg)) };
}

function ready() {
  opening ??= open().catch((e) => { opening = null; throw e; });
  return opening;
}

/** The app's database client (supabase-js shaped). Opens the on-device database on first use. */
export async function createClient(): Promise<Supa> { return (await ready()).client; }

/** The raw database, for backup/restore and maintenance. Not scoped to the user: use sparingly. */
export async function rawDatabase(): Promise<PGlite> { return (await ready()).pg; }

/** Tests: use an already-open database instead of IndexedDB. */
export function useDatabase(pg: PGlite): void {
  opening = Promise.resolve({ pg, client: makeClient(userExecutor(pg)) });
  notifyChange();
}
