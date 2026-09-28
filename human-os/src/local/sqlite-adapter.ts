// Presents sql.js (SQLite compiled to JavaScript) with the small subset of the
// better-sqlite3 API the server code uses: prepare().get/all/run, exec, pragma, transaction.
import type { Database as SqlJsDatabase, SqlValue } from "sql.js";

type Params = SqlValue[];

function normalize(args: unknown[]): Params {
  const list = args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  return list.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : (v as SqlValue)));
}

/** Gives sql.js errors the same `code` values better-sqlite3 uses, so the error handler maps them. */
function mapError(e: unknown): Error {
  const message = e instanceof Error ? e.message : String(e);
  const err = new Error(message) as Error & { code?: string };
  if (/UNIQUE constraint failed/.test(message)) err.code = "SQLITE_CONSTRAINT_UNIQUE";
  else if (/FOREIGN KEY constraint failed/.test(message)) err.code = "SQLITE_CONSTRAINT_FOREIGNKEY";
  else if (/CHECK constraint failed/.test(message)) err.code = "SQLITE_CONSTRAINT_CHECK";
  else if (/NOT NULL constraint failed/.test(message)) err.code = "SQLITE_CONSTRAINT_NOTNULL";
  else if (/constraint failed/.test(message)) err.code = "SQLITE_CONSTRAINT";
  return err;
}

export class BrowserDatabase {
  private depth = 0;
  constructor(public inner: SqlJsDatabase) {
    this.inner.exec("PRAGMA foreign_keys = ON");
  }

  /** Swaps the underlying database (after a save reopened it, or another tab saved). */
  replace(next: SqlJsDatabase) {
    if (next !== this.inner) {
      try {
        this.inner.close();
      } catch {
        /* already closed */
      }
    }
    this.inner = next;
    this.inner.exec("PRAGMA foreign_keys = ON");
  }

  // Statements are prepared per call: sql.js frees every prepared statement on export().
  prepare(sql: string) {
    const db = this;
    const withStatement = <T,>(args: unknown[], fn: (st: ReturnType<SqlJsDatabase["prepare"]>) => T): T => {
      let st: ReturnType<SqlJsDatabase["prepare"]> | null = null;
      try {
        st = db.inner.prepare(sql);
        st.bind(normalize(args));
        return fn(st);
      } catch (e) {
        throw mapError(e);
      } finally {
        st?.free();
      }
    };
    return {
      get: (...args: unknown[]) => withStatement(args, (st) => (st.step() ? st.getAsObject() : undefined)),
      all: (...args: unknown[]) =>
        withStatement(args, (st) => {
          const rows: Record<string, SqlValue>[] = [];
          while (st.step()) rows.push(st.getAsObject());
          return rows;
        }),
      run: (...args: unknown[]) =>
        withStatement(args, (st) => {
          st.step();
          return { changes: db.inner.getRowsModified(), lastInsertRowid: 0 };
        }),
    };
  }

  exec(sql: string) {
    try {
      this.inner.exec(sql);
    } catch (e) {
      throw mapError(e);
    }
    return this;
  }

  pragma(statement: string) {
    this.exec(`PRAGMA ${statement}`);
  }

  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A) => {
      const level = this.depth++;
      const sp = `sp_${level}`;
      this.exec(level === 0 ? "BEGIN" : `SAVEPOINT ${sp}`);
      try {
        const result = fn(...args);
        this.exec(level === 0 ? "COMMIT" : `RELEASE ${sp}`);
        return result;
      } catch (e) {
        try {
          this.exec(level === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        } catch {
          /* nothing to roll back */
        }
        throw e;
      } finally {
        this.depth--;
      }
    };
  }

  totalChanges(): number {
    const r = this.inner.exec("SELECT total_changes()");
    return Number(r[0]?.values[0]?.[0] ?? 0);
  }

  close() {
    this.inner.close();
  }
}
