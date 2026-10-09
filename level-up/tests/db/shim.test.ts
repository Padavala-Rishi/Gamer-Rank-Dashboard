import { afterAll, describe, expect, it } from "vitest";
import { makeClient } from "@/db/shim";
import { userExecutor } from "@/db/open";
import { LOCAL_USER_ID } from "@/db/bootstrap";
import { admin, pg } from "./helpers";

// The supabase-js–shaped client the whole app uses, running on the shipped engine, as the local user (under RLS).
const db = makeClient(userExecutor(pg));
afterAll(() => admin.end());

const ins = async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
  const r = await db.from("tasks").insert(rows).select("id,title,scheduled_date,created_at,est_minutes,priority");
  expect(r.error).toBeNull();
  return r.data as { id: string; title: string; scheduled_date: string | null; created_at: string; est_minutes: number | null; priority: number }[];
};

describe("query builder", () => {
  it("the local user's profile and settings exist from the first open", async () => {
    const p = await db.from("profiles").select("*").eq("id", LOCAL_USER_ID).single();
    expect(p.error).toBeNull();
    expect(p.data.character_name).toBe("Player One");
    const s = await db.from("user_settings").select("*").eq("user_id", LOCAL_USER_ID).maybeSingle();
    expect(s.data.xp_values).toEqual({ easy: 10, medium: 25, hard: 50, boss: 100 });
    expect(typeof s.data.level_base).toBe("number"); // numerics are JSON numbers, as PostgREST sends them
  });

  it("returns dates as strings and timestamps as ISO strings; missing columns use their defaults", async () => {
    const [a, b] = await ins([{ title: "A", category: "dev", scheduled_date: "2026-03-04", est_minutes: 30 }, { title: "B", category: "dev" }]);
    expect(a.scheduled_date).toBe("2026-03-04");
    expect(b.scheduled_date).toBeNull();
    expect(b.priority).toBe(2); // the column default, not NULL (bulk insert with differing keys)
    expect(new Date(a.created_at).toString()).not.toBe("Invalid Date");
    expect(a.created_at).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("filters: eq neq gt gte lt lte in is not, plus order / limit / range", async () => {
    const rows = await ins([1, 2, 3, 4, 5].map((n) => ({ title: `F${n}`, category: "life", est_minutes: n * 10, scheduled_date: n % 2 ? "2026-05-01" : null })));
    const ids = rows.map((r) => r.id);
    const q = () => db.from("tasks").select("title,est_minutes").in("id", ids);
    expect((await q().eq("est_minutes", 30)).data).toEqual([{ title: "F3", est_minutes: 30 }]);
    expect((await q().neq("est_minutes", 30)).data).toHaveLength(4);
    expect((await q().gt("est_minutes", 30)).data).toHaveLength(2);
    expect((await q().gte("est_minutes", 30)).data).toHaveLength(3);
    expect((await q().lt("est_minutes", 30)).data).toHaveLength(2);
    expect((await q().lte("est_minutes", 30)).data).toHaveLength(3);
    expect((await q().is("scheduled_date", null)).data).toHaveLength(2);
    expect((await q().not("scheduled_date", "is", null)).data).toHaveLength(3);
    expect((await q().not("est_minutes", "in", [10, 20])).data).toHaveLength(3);
    expect((await q().order("est_minutes", { ascending: false }).limit(2)).data.map((r: any) => r.est_minutes)).toEqual([50, 40]);
    expect((await q().order("est_minutes").range(1, 2)).data.map((r: any) => r.est_minutes)).toEqual([20, 30]);
    // nullsFirst: false puts the undated quests last
    const dated = (await q().order("scheduled_date", { nullsFirst: false }).order("est_minutes")).data.map((r: any) => r.title);
    expect(dated.slice(-2)).toEqual(["F2", "F4"]);
  });

  it("single() / maybeSingle() report 0 or many rows like PostgREST", async () => {
    const none = await db.from("tasks").select("*").eq("title", "no such quest").single();
    expect(none.data).toBeNull();
    expect(none.error?.code).toBe("PGRST116");
    expect((await db.from("tasks").select("*").eq("title", "no such quest").maybeSingle())).toMatchObject({ data: null, error: null });
    await ins([{ title: "Twin", category: "life" }, { title: "Twin", category: "life" }]);
    expect((await db.from("tasks").select("*").eq("title", "Twin").maybeSingle()).error?.code).toBe("PGRST116");
  });

  it("count with head returns only the count", async () => {
    await ins({ title: "Counted", category: "life", is_sample: true });
    const r = await db.from("tasks").select("id", { count: "exact", head: true }).eq("is_sample", true);
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
    expect(r.count).toBeGreaterThanOrEqual(1);
    const withRows = await db.from("tasks").select("id", { count: "exact" }).eq("title", "Counted");
    expect(withRows.count).toBe(1);
    expect(withRows.data).toHaveLength(1);
  });

  it("update / delete are scoped by filters and return rows only when asked", async () => {
    const [t] = await ins({ title: "Edit me", category: "life" });
    const u = await db.from("tasks").update({ title: "Edited", est_minutes: 15 }).eq("id", t.id).select("id,title");
    expect(u.data).toEqual([{ id: t.id, title: "Edited" }]);
    expect((await db.from("tasks").update({ title: "x" }).eq("id", t.id)).data).toBeNull();
    const d = await db.from("tasks").delete().eq("id", t.id).select("id");
    expect(d.data).toEqual([{ id: t.id }]);
    expect((await db.from("tasks").select("id").eq("id", t.id)).data).toEqual([]);
  });

  it("upsert with onConflict + ignoreDuplicates is idempotent", async () => {
    const [tpl] = await ins({ title: "Template", category: "life", status: "template", recurrence: { freq: "daily", interval: 1, start: "2026-06-01" } });
    const row = { template_id: tpl.id, title: "Copy", category: "life", scheduled_date: "2026-06-01" };
    expect((await db.from("tasks").upsert([row], { onConflict: "template_id,scheduled_date", ignoreDuplicates: true })).error).toBeNull();
    expect((await db.from("tasks").upsert([row], { onConflict: "template_id,scheduled_date", ignoreDuplicates: true })).error).toBeNull();
    expect((await db.from("tasks").select("id").eq("template_id", tpl.id)).data).toHaveLength(1);
  });

  it("embeds a to-one relation like PostgREST does", async () => {
    const [t] = await ins({ title: "Embedded", category: "dev", difficulty: "hard" });
    expect((await db.rpc("complete_task", { p_task_id: t.id })).error).toBeNull();
    const r = await db.from("task_completions").select("id,xp_awarded,tasks(id,title,difficulty)").eq("task_id", t.id);
    expect(r.data).toHaveLength(1);
    expect(r.data[0].tasks).toEqual({ id: t.id, title: "Embedded", difficulty: "hard" });
    const a = await db.from("user_achievements").select("key,achievement_defs(title)");
    expect(a.error).toBeNull();
    expect(a.data.length).toBeGreaterThan(0);
    expect(a.data[0]).toHaveProperty("achievement_defs");
  });

  it("rpc: jsonb functions, set-returning functions, void functions, unknown functions", async () => {
    const [t] = await ins({ title: "Rpc", category: "basketball", difficulty: "easy" });
    const done = await db.rpc("complete_task", { p_task_id: t.id });
    expect(done.data.xp).toBe(10);
    expect((await db.rpc("complete_task", { p_task_id: t.id })).data.already_done).toBe(true);
    const days = await db.rpc("daily_xp", { p_from: "2000-01-01", p_to: "2100-01-01" });
    expect(Array.isArray(days.data)).toBe(true);
    expect(days.data.some((r: any) => r.category === "basketball")).toBe(true);
    expect((await db.rpc("progress_summary")).data.metrics.quests_done).toBeGreaterThan(0);
    expect(await db.rpc("ensure_profile")).toMatchObject({ error: null });
    expect((await db.rpc("does_not_exist")).error?.code).toBe("PGRST202");
  });

  it("errors carry the SQLSTATE code the UI maps to messages", async () => {
    expect((await db.from("xp_transactions").insert({ amount: 1000 })).error?.code).toBe("42501"); // clients can't write the ledger
    expect((await db.from("tasks").insert({ title: "", category: "dev" })).error).not.toBeNull();
    const bad = await db.from("tasks").insert({ title: "Bad", category: "nonsense" });
    expect(bad.error?.code).toBeTruthy();
    expect(typeof bad.error?.message).toBe("string");
  });

  it("refuses identifiers and operators it doesn't understand instead of building odd SQL", async () => {
    expect(() => db.from("tasks").select("id").eq("title; drop table tasks", "x")).toThrow(/Unsupported identifier/);
    expect(() => db.from("tasks").select("id").not("title", "like", "%")).toThrow(/Unsupported/);
    expect(() => db.from('tasks"; --')).toThrow();
    expect((await db.from("tasks").select("id,evil(1)")).error?.message).toMatch(/Unsupported/);
    expect((await db.from("tasks").select("id").limit(1)).error).toBeNull();
  });
});
