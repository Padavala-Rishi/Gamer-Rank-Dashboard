import { LOCAL_USER_ID } from "./bootstrap";
import { rawDatabase } from "./client";
import { notifyChange } from "./events";
import { flush } from "./open";

/** Every table that belongs to the user, in the order they are written back. Reference data (categories, achievement_defs) is not backed up. */
export const BACKUP_TABLES = [
  "profiles", "user_settings", "subjects", "projects", "drills", "practice_plans", "workout_routines", "bball_metrics",
  "tasks", "task_completions", "xp_transactions", "activity_events", "user_achievements", "day_plans", "rewards",
  "syllabus_nodes", "exams", "focus_sessions",
  "practice_sessions", "practice_drills", "performance_logs",
  "roadmap_items", "freelance_leads", "outreach_log", "income_records",
  "workouts", "workout_sets", "body_metrics", "health_days", "nutrition_entries", "coach_runs",
] as const;

export type Backup = { app: "level-up"; exported_at: string; format: 1; tables: Record<string, Record<string, unknown>[]> };

export async function exportBackup(): Promise<Backup> {
  const pg = await rawDatabase();
  const tables: Backup["tables"] = {};
  for (const t of BACKUP_TABLES) {
    const r = await pg.query<{ rows: Record<string, unknown>[] }>(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows from public.${t} t`);
    tables[t] = r.rows[0].rows;
  }
  return { app: "level-up", exported_at: new Date().toISOString(), format: 1, tables };
}

export function backupFilename(d = new Date()) { return `level-up-backup-${d.toISOString().slice(0, 10)}.json`; }

/** Validate a parsed file. Throws a message the user can act on. */
export function parseBackup(raw: unknown): Backup {
  const b = raw as Partial<Backup> | null;
  if (!b || typeof b !== "object" || b.app !== "level-up" || b.format !== 1 || !b.tables || typeof b.tables !== "object") throw new Error("That file isn't a Level Up backup.");
  for (const t of BACKUP_TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`The backup is damaged (${t}).`);
  }
  return b as Backup;
}

/**
 * Replace everything on this device with the backup. Runs in one transaction: either all of it is restored or none.
 * Triggers are bypassed (session_replication_role = replica), so restoring writes exactly what the file contains and no new XP.
 */
export async function importBackup(raw: unknown): Promise<{ rows: number }> {
  const backup = parseBackup(raw);
  const pg = await rawDatabase();
  let rows = 0;
  await pg.transaction(async (tx) => {
    await tx.exec("set local session_replication_role = replica");
    await tx.exec(`truncate table ${BACKUP_TABLES.map((t) => `public.${t}`).join(", ")} cascade`);
    for (const t of BACKUP_TABLES) {
      const list = backup.tables[t] ?? [];
      if (!list.length) continue;
      // One person per device: whatever account the file came from, its rows belong to this device's user.
      const mine = list.map((r) => ({ ...r, ...("user_id" in r ? { user_id: LOCAL_USER_ID } : {}), ...(t === "profiles" ? { id: LOCAL_USER_ID } : {}) }));
      await tx.query(`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t}, $1::jsonb)`, [JSON.stringify(mine)]);
      rows += mine.length;
    }
    // a backup without a profile or settings row still leaves a usable install
    await tx.query("insert into public.profiles (id) values ($1) on conflict do nothing", [LOCAL_USER_ID]);
    await tx.query("insert into public.user_settings (user_id) values ($1) on conflict do nothing", [LOCAL_USER_ID]);
  });
  await flush(pg);
  notifyChange();
  return { rows };
}

/** Reset the on-device database to a brand new install (used by "erase everything on this device"). */
export async function eraseDevice(): Promise<void> {
  const pg = await rawDatabase();
  await pg.transaction(async (tx) => {
    await tx.exec("set local session_replication_role = replica");
    await tx.exec(`truncate table ${BACKUP_TABLES.map((t) => `public.${t}`).join(", ")} cascade`);
    await tx.query("insert into public.profiles (id) values ($1) on conflict do nothing", [LOCAL_USER_ID]);
    await tx.query("insert into public.user_settings (user_id) values ($1) on conflict do nothing", [LOCAL_USER_ID]);
  });
  await flush(pg);
  notifyChange();
}
