import { addDays, type YMD } from "../dates";
import { check } from "./action";
import type { Ctx } from "./context";
import type { ActivityEvent, DayPlan, Exam, Task } from "../types";
import type { XpRow } from "../game/analytics";

// Typed reads shared by several pages. All run as the signed-in user, so RLS scopes every result.

export async function getOpenTasks({ supabase }: Ctx): Promise<Task[]> {
  const data = check(await supabase.from("tasks").select("*").eq("status", "open").order("scheduled_date", { nullsFirst: false }).order("created_at").limit(1000));
  return data as Task[];
}

export type DoneRow = { id: string; task_id: string; completed_on: YMD; completed_at: string; xp_awarded: number; category: Task["category"]; tasks: Pick<Task, "id" | "title" | "difficulty" | "quest_type" | "est_minutes" | "actual_minutes" | "is_sample" | "scheduled_date" | "parent_id"> | null };

export async function getCompletions({ supabase }: Ctx, from: YMD, to: YMD): Promise<DoneRow[]> {
  const data = check(await supabase.from("task_completions")
    .select("id,task_id,completed_on,completed_at,xp_awarded,category,tasks(id,title,difficulty,quest_type,est_minutes,actual_minutes,is_sample,scheduled_date,parent_id)")
    .eq("status", "active").gte("completed_on", from).lte("completed_on", to).order("completed_at", { ascending: false }));
  return data as unknown as DoneRow[];
}

export async function getActiveDates({ supabase }: Ctx, from: YMD): Promise<YMD[]> {
  const data = check(await supabase.from("task_completions").select("completed_on").eq("status", "active").gte("completed_on", from));
  return [...new Set((data ?? []).map((r) => r.completed_on as YMD))];
}

export async function getRestDates({ supabase }: Ctx, from: YMD): Promise<YMD[]> {
  const data = check(await supabase.from("health_days").select("day").eq("is_rest_day", true).gte("day", from));
  return (data ?? []).map((r) => r.day as YMD);
}

export async function getEvents({ supabase }: Ctx, limit = 10): Promise<ActivityEvent[]> {
  return check(await supabase.from("activity_events").select("*").order("created_at", { ascending: false }).limit(limit)) as ActivityEvent[];
}

export async function getXpRows({ supabase }: Ctx, from: YMD, to: YMD): Promise<XpRow[]> {
  const data = check(await supabase.rpc("daily_xp", { p_from: from, p_to: to }));
  return (data ?? []) as XpRow[];
}

export async function getUpcomingExams({ supabase }: Ctx, today: YMD): Promise<Exam[]> {
  return check(await supabase.from("exams").select("*").eq("status", "upcoming").gte("exam_date", today).order("exam_date").limit(20)) as Exam[];
}

export async function getDayPlan({ supabase }: Ctx, day: YMD): Promise<DayPlan | null> {
  return check(await supabase.from("day_plans").select("*").eq("day", day).maybeSingle()) as DayPlan | null;
}

export { addDays };
