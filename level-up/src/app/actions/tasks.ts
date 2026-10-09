"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, check, type ActionResult } from "@/lib/server/action";
import { getContext } from "@/lib/server/context";
import { ensureRecurring } from "@/lib/server/recurring";
import { checkSchedule, type PlannerTask, type ScheduleCheck } from "@/lib/game/planner";
import { addDays, isYMD, type YMD } from "@/lib/dates";
import { occurrencesBetween } from "@/lib/game/recurrence";
import { taskSchema, text, optYmd, ymd, uuid } from "@/lib/schemas";
import type { CompleteResult, Task } from "@/lib/types";

const refresh = () => revalidatePath("/", "layout");

const PLANNER_COLS = "id,title,category,difficulty,priority,est_minutes,scheduled_date,due_date,status,quest_type,subject_id,parent_id,template_id";

async function loadDay(supabase: Awaited<ReturnType<typeof getContext>>["supabase"], from: YMD, to: YMD): Promise<PlannerTask[]> {
  const { data, error } = await supabase.from("tasks").select(PLANNER_COLS).eq("status", "open").gte("scheduled_date", from).lte("scheduled_date", to);
  if (error) throw error;
  return (data ?? []) as PlannerTask[];
}

/** The planner refused the day; the error carries a better date to offer. */
function dayFull(c: ScheduleCheck) {
  return Object.assign(new Error(c.message ?? "That day is full."), { code: "LV006", meta: { suggestedDate: c.suggestedDate } });
}

type CreateData = { id: string; warning: string | null };

/** Create a quest (or a repeating quest). The planner refuses a day that cannot realistically be finished. */
export async function createTask(input: unknown): Promise<ActionResult<CreateData>> {
  return run(async () => {
    const { supabase, settings, today } = await getContext();
    const v = taskSchema.parse(input);
    let warning: string | null = null;
    const { recurrence, ...fields } = v;

    if (recurrence) {
      const start = recurrence.start;
      const rec = { ...recurrence, monthday: recurrence.monthday ?? undefined, until: recurrence.until ?? null };
      const horizon = addDays(today < start ? start : today, 13);
      const dates = occurrencesBetween(rec, today < start ? start : today, horizon);
      const existing = await loadDay(supabase, today, horizon);
      const extra: PlannerTask[] = [];
      for (const d of dates) {
        const c = checkSchedule({ tasks: [...existing, ...extra], date: d, addMinutes: fields.est_minutes ?? null, settings });
        if (c.verdict === "blocked") throw Object.assign(new Error(`${d} is already full. ${c.message}`), { code: "LV006", meta: { suggestedDate: c.suggestedDate } });
        if (c.verdict === "full" && !warning) warning = c.message;
        extra.push({ id: `new-${d}`, title: fields.title, category: fields.category, difficulty: fields.difficulty, priority: fields.priority, est_minutes: fields.est_minutes ?? null, scheduled_date: d, status: "open" });
      }
      const tpl = check(await supabase.from("tasks").insert({ ...fields, scheduled_date: null, status: "template", recurrence: rec, verify: fields.verify ?? null }).select("*").single()) as Task;
      await ensureRecurring(supabase, today);
      refresh();
      return { id: tpl.id, warning };
    }

    if (fields.scheduled_date) {
      const day = await loadDay(supabase, fields.scheduled_date, fields.scheduled_date);
      const c = checkSchedule({ tasks: day, date: fields.scheduled_date, addMinutes: fields.est_minutes ?? null, settings });
      if (c.verdict === "blocked") throw dayFull(c);
      warning = c.message;
    }
    const row = check(await supabase.from("tasks").insert({ ...fields, verify: fields.verify ?? null, status: "open" }).select("id").single());
    refresh();
    return { id: (row as { id: string }).id, warning };
  });
}

const patchSchema = taskSchema.partial().omit({ recurrence: true });

export async function updateTask(id: string, input: unknown): Promise<ActionResult<{ warning: string | null }>> {
  return run(async () => {
    const { supabase, settings } = await getContext();
    uuid.parse(id);
    const patch = patchSchema.parse(input);
    let warning: string | null = null;
    if (patch.scheduled_date) {
      const day = await loadDay(supabase, patch.scheduled_date, patch.scheduled_date);
      const c = checkSchedule({ tasks: day, date: patch.scheduled_date, addMinutes: patch.est_minutes ?? null, settings, ignoreId: id });
      if (c.verdict === "blocked") throw dayFull(c);
      warning = c.message;
    }
    check(await supabase.from("tasks").update({ ...patch }).eq("id", id).neq("status", "template").select("id").single());
    refresh();
    return { warning };
  });
}

/** Move a quest to another day (or to the backlog). No penalty, no shaming. */
export async function rescheduleTask(id: string, date: string | null): Promise<ActionResult<{ warning: string | null }>> {
  return run(async () => {
    const { supabase, settings } = await getContext();
    uuid.parse(id);
    const d = optYmd.parse(date);
    let warning: string | null = null;
    if (d) {
      const { data: t } = await supabase.from("tasks").select("est_minutes").eq("id", id).single();
      const day = await loadDay(supabase, d, d);
      const c = checkSchedule({ tasks: day, date: d, addMinutes: t?.est_minutes ?? null, settings, ignoreId: id });
      if (c.verdict === "blocked") throw dayFull(c);
      warning = c.message;
    }
    check(await supabase.from("tasks").update({ scheduled_date: d, status: "open" }).eq("id", id).in("status", ["open", "skipped", "discarded"]).select("id").single());
    refresh();
    return { warning };
  });
}

/** Set a quest aside without deleting it. Skipped quests can be brought back. */
export async function setQuestStatus(id: string, status: "skipped" | "discarded" | "open"): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await getContext();
    uuid.parse(id);
    z.enum(["skipped", "discarded", "open"]).parse(status);
    check(await supabase.from("tasks").update({ status }).eq("id", id).in("status", ["open", "skipped", "discarded"]).select("id").single());
    refresh();
  });
}

export async function deleteTask(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, today } = await getContext();
    uuid.parse(id);
    const { data: t } = await supabase.from("tasks").select("status").eq("id", id).single();
    if (t?.status === "template") {
      // stop repeating: remove upcoming untouched instances; history stays
      check(await supabase.from("tasks").delete().eq("template_id", id).eq("status", "open").gte("scheduled_date", today).select("id"));
    }
    check(await supabase.from("tasks").delete().eq("id", id).select("id"));
    refresh();
  });
}

/** Complete a quest. The database decides the XP; the client only says which quest. */
export async function completeTask(id: string, minutes?: number | null): Promise<ActionResult<CompleteResult>> {
  return run(async () => {
    const { supabase } = await getContext();
    uuid.parse(id);
    const m = minutes == null ? null : z.number().int().min(0).max(100000).parse(minutes);
    const res = check(await supabase.rpc("complete_task", { p_task_id: id, p_minutes: m }));
    refresh();
    return res as unknown as CompleteResult;
  });
}

export async function undoTask(id: string): Promise<ActionResult<{ undone: boolean; xp_removed: number }>> {
  return run(async () => {
    const { supabase } = await getContext();
    uuid.parse(id);
    const res = check(await supabase.rpc("undo_task", { p_task_id: id }));
    refresh();
    return res as unknown as { undone: boolean; xp_removed: number };
  });
}

/** Split a big quest into smaller ones. The parent can't be completed until its sub-quests are. */
export async function breakDown(parentId: string, titles: string[], date: string | null): Promise<ActionResult<{ created: number }>> {
  return run(async () => {
    const { supabase, settings } = await getContext();
    uuid.parse(parentId);
    const list = z.array(text(160, "Title")).min(1, "Add at least one step").max(12).parse(titles.map((t) => t.trim()).filter(Boolean));
    const d = optYmd.parse(date);
    const { data: p } = await supabase.from("tasks").select("category,subject_id,project_id").eq("id", parentId).single();
    if (!p) throw Object.assign(new Error("Quest not found"), { code: "P0002" });
    if (d) {
      const day = await loadDay(supabase, d, d);
      const c = checkSchedule({ tasks: [...day, ...list.slice(1).map((t, i) => ({ id: `n${i}`, title: t, category: p.category, difficulty: "easy", priority: 2, est_minutes: 30, scheduled_date: d, status: "open" }) as PlannerTask)], date: d, addMinutes: 30, settings });
      if (c.verdict === "blocked") throw dayFull(c);
    }
    const rows = list.map((title) => ({ title, parent_id: parentId, category: p.category, subject_id: p.subject_id, project_id: p.project_id, difficulty: "easy", quest_type: "daily", scheduled_date: d, status: "open" }));
    check(await supabase.from("tasks").insert(rows).select("id"));
    refresh();
    return { created: rows.length };
  });
}

// ───────── day plan: Minimum Viable Day and the end-of-day review ─────────

export async function setMinimumViableDay(day: string, on: boolean): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user } = await getContext();
    ymd.parse(day);
    check(await supabase.from("day_plans").upsert({ user_id: user.id, day, mvd: !!on }, { onConflict: "user_id,day" }).select("day"));
    refresh();
  });
}

const reviewSchema = z.object({
  day: ymd,
  wins: z.string().trim().max(500).default(""),
  friction: z.string().trim().max(500).default(""),
  tomorrow: z.string().trim().max(500).default(""),
  /** what to do with each unfinished quest from the day */
  leftovers: z.record(z.string(), z.enum(["tomorrow", "backlog", "discard", "keep"])).default({}),
});

export async function saveDayReview(input: unknown): Promise<ActionResult<{ moved: number; backlogged: number; discarded: number }>> {
  return run(async () => {
    const { supabase, user, settings } = await getContext();
    const v = reviewSchema.parse(input);
    const tomorrow = addDays(v.day, 1);
    const load = await loadDay(supabase, tomorrow, tomorrow);
    let moved = 0, backlogged = 0, discarded = 0;
    for (const [id, action] of Object.entries(v.leftovers)) {
      if (!isYMD(v.day) || !/^[0-9a-f-]{36}$/.test(id) || action === "keep") continue;
      if (action === "discard") {
        check(await supabase.from("tasks").update({ status: "discarded" }).eq("id", id).eq("status", "open").select("id"));
        discarded++;
      } else if (action === "backlog") {
        check(await supabase.from("tasks").update({ scheduled_date: null }).eq("id", id).eq("status", "open").select("id"));
        backlogged++;
      } else {
        const { data: t } = await supabase.from("tasks").select("est_minutes,category,title").eq("id", id).eq("status", "open").maybeSingle();
        if (!t) continue;
        const c = checkSchedule({ tasks: load, date: tomorrow, addMinutes: t.est_minutes, settings });
        if (c.verdict === "blocked") {
          check(await supabase.from("tasks").update({ scheduled_date: null }).eq("id", id).select("id")); // tomorrow is full: park it, don't overload
          backlogged++;
        } else {
          check(await supabase.from("tasks").update({ scheduled_date: tomorrow }).eq("id", id).select("id"));
          load.push({ id, title: t.title, category: t.category, difficulty: "easy", priority: 2, est_minutes: t.est_minutes, scheduled_date: tomorrow, status: "open" });
          moved++;
        }
      }
    }
    check(await supabase.from("day_plans").upsert({ user_id: user.id, day: v.day, review: { wins: v.wins, friction: v.friction, tomorrow: v.tomorrow }, reviewed_at: new Date().toISOString() }, { onConflict: "user_id,day" }).select("day"));
    refresh();
    return { moved, backlogged, discarded };
  });
}

/** Persist a manual ordering (drag-and-drop or move up/down). */
export async function reorderTasks(ids: string[]): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await getContext();
    const list = z.array(uuid).min(1).max(200).parse(ids);
    const results = await Promise.all(list.map((id, i) => supabase.from("tasks").update({ sort_order: (i + 1) * 10 }).eq("id", id).select("id")));
    for (const r of results) if (r.error) throw r.error;
    refresh();
  });
}

export async function regenerateRepeating(): Promise<ActionResult<{ created: number }>> {
  return run(async () => {
    const { supabase, today } = await getContext();
    const created = await ensureRecurring(supabase, today);
    if (created) refresh();
    return { created };
  });
}
