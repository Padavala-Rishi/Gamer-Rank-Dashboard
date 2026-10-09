import { afterAll, describe, expect, it } from "vitest";
import { backupFilename, BACKUP_TABLES, eraseDevice, exportBackup, importBackup, parseBackup } from "@/db/backup";
import { LOCAL_USER_ID } from "@/db/bootstrap";
import { useDatabase } from "@/db/client";
import { userExecutor } from "@/db/open";
import { makeClient } from "@/db/shim";
import { admin, pg } from "./helpers";

useDatabase(pg);
const db = makeClient(userExecutor(pg));
afterAll(() => admin.end());

async function populate() {
  await db.from("profiles").update({ character_name: "Backup Hero", onboarded_at: new Date().toISOString() }).eq("id", LOCAL_USER_ID);
  const [dev, bb] = (await db.from("tasks").insert([{ title: "Ship it", category: "dev", difficulty: "hard", scheduled_date: "2026-04-01" }, { title: "Free throws", category: "basketball" }]).select("id")).data;
  await db.rpc("complete_task", { p_task_id: dev.id, p_minutes: 40 });
  const [subj] = (await db.from("subjects").insert({ name: "Maths" }).select("id")).data;
  await db.from("syllabus_nodes").insert({ subject_id: subj.id, kind: "unit", title: "Unit 1", sort_order: 1 });
  await db.from("health_days").insert({ day: "2026-04-01", water_ml: 2500, sleep_hours: 7.5 });
  return { open: bb.id as string };
}

const snapshot = async () => ({
  summary: (await db.rpc("progress_summary")).data,
  ledger: (await admin.query("select kind, amount, task_id from xp_transactions order by created_at, id")).rows,
  tasks: (await db.from("tasks").select("title,status,scheduled_date,category").order("title")).data,
  profile: (await db.from("profiles").select("character_name,onboarded_at").eq("id", LOCAL_USER_ID).single()).data,
  health: (await db.from("health_days").select("day,water_ml,sleep_hours")).data,
});

describe("backup and restore", () => {
  it("a backup restores the exact state, including XP, without paying any new XP", async () => {
    await populate();
    const before = await snapshot();
    const file = JSON.parse(JSON.stringify(await exportBackup())); // through JSON, like a real file
    expect(Object.keys(file.tables).sort()).toEqual([...BACKUP_TABLES].sort());

    await eraseDevice();
    const wiped = await snapshot();
    expect(wiped.tasks).toEqual([]);
    expect(wiped.summary.metrics.quests_done).toBe(0);
    expect(wiped.profile.character_name).toBe("Player One");

    const r = await importBackup(file);
    expect(r.rows).toBeGreaterThan(5);
    expect(await snapshot()).toEqual(before);
  });

  it("restored quests behave normally afterwards (undo works, no double payment)", async () => {
    const [done] = (await db.from("task_completions").select("task_id").eq("status", "active")).data;
    const xp = (await db.rpc("progress_summary")).data.metrics.xp_total;
    expect((await db.rpc("complete_task", { p_task_id: done.task_id })).data.already_done).toBe(true);
    const undone = await db.rpc("undo_task", { p_task_id: done.task_id });
    expect(undone.error).toBeNull();
    expect((await db.rpc("progress_summary")).data.metrics.xp_total).toBeLessThan(xp);
    expect((await db.rpc("complete_task", { p_task_id: done.task_id })).data.xp).toBeGreaterThan(0);
    expect((await db.rpc("progress_summary")).data.metrics.xp_total).toBe(xp);
  });

  it("a backup made under a different account id is adopted by this device's user", async () => {
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    const other = "11111111-2222-4333-8444-555555555555";
    for (const rows of Object.values(file.tables) as Record<string, unknown>[][]) {
      for (const row of rows) { if ("user_id" in row) row.user_id = other; if ("id" in row && rows === file.tables.profiles) row.id = other; }
    }
    await importBackup(file);
    expect((await db.from("profiles").select("character_name").eq("id", LOCAL_USER_ID).single()).data.character_name).toBe("Backup Hero");
    expect((await db.from("tasks").select("id")).data.length).toBe(2);
    expect((await admin.query("select count(*)::int n from tasks where user_id <> $1", [LOCAL_USER_ID])).rows[0].n).toBe(0);
  });

  it("rejects files that aren't backups, and a damaged import changes nothing", async () => {
    for (const bad of [null, "text", {}, { app: "other", format: 1, tables: {} }, { app: "level-up", format: 2, tables: {} }, { app: "level-up", format: 1, tables: { tasks: "nope" } }]) {
      expect(() => parseBackup(bad)).toThrow(/backup|damaged/i);
    }
    const before = await snapshot();
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    file.tables.tasks[0].status = "not-a-status"; // violates a check constraint half-way through the restore
    await expect(importBackup(file)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("names backup files by date", () => {
    expect(backupFilename(new Date("2026-10-09T12:00:00Z"))).toBe("level-up-backup-2026-10-09.json");
  });
});
