import { addDays, startOfMonth, type YMD } from "../dates";
import { buildCharacter, curvesFromSettings } from "../game/xp";
import type { Supa } from "@/db/client";
import type { Profile, ProgressSummary, Settings } from "../types";
import type { RawCoachData } from "./context";
import { shapeCoachContext } from "./context";
import { todayIn } from "../dates";

/** Fetch the signed-in user's recent records (RLS-scoped) and shape them into what the coach may see. */
export async function loadCoachContext(supabase: Supa, profile: Profile, settings: Settings) {
  const today = todayIn(profile.timezone);
  const from14 = addDays(today, -13), from60 = addDays(today, -60);
  const q = <T,>(p: PromiseLike<{ data: unknown; error: unknown }>) => Promise.resolve(p).then((r) => (r.data ?? []) as T);

  const [progress, tasks, completions, xpRows, active, exams, subjects, syllabus, focus, practice, workouts, health, protein, projects, leads, outreach, income] = await Promise.all([
    supabase.rpc("progress_summary").then((r) => r.data as ProgressSummary),
    q<RawCoachData["tasks"]>(supabase.from("tasks").select("title,category,difficulty,quest_type,priority,est_minutes,scheduled_date,due_date,status,template_id").eq("status", "open").limit(300)),
    q<{ completed_on: YMD; xp_awarded: number; category: RawCoachData["tasks"][number]["category"]; tasks: { title: string; difficulty: string } | null }[]>(supabase.from("task_completions").select("completed_on,xp_awarded,category,tasks(title,difficulty)").eq("status", "active").gte("completed_on", from14).order("completed_on", { ascending: false }).limit(120)),
    q<RawCoachData["xpRows"]>(supabase.rpc("daily_xp", { p_from: from14, p_to: today })),
    q<{ completed_on: YMD }[]>(supabase.from("task_completions").select("completed_on").eq("status", "active").gte("completed_on", from60)),
    q<RawCoachData["exams"]>(supabase.from("exams").select("title,exam_date,subject_id").eq("status", "upcoming").gte("exam_date", today).order("exam_date").limit(10)),
    q<RawCoachData["subjects"]>(supabase.from("subjects").select("id,name,weekly_target_min").eq("archived", false)),
    q<RawCoachData["syllabus"]>(supabase.from("syllabus_nodes").select("id,subject_id,parent_id,kind,title,status,sort_order,revision_count,next_revision_on,last_revised_on").limit(1000)),
    q<RawCoachData["focus"]>(supabase.from("focus_sessions").select("category,session_date,minutes,subject_id").gte("session_date", from14)),
    q<RawCoachData["practice"]>(supabase.from("practice_sessions").select("session_date,duration_min,intensity,status").gte("session_date", from14)),
    q<RawCoachData["workouts"]>(supabase.from("workouts").select("workout_date,duration_min").gte("workout_date", from14)),
    q<RawCoachData["health"]>(supabase.from("health_days").select("day,water_ml,sleep_hours,mobility_min,is_rest_day").gte("day", from14)),
    q<{ logged_on: YMD; protein_g: number | string }[]>(supabase.from("nutrition_entries").select("logged_on,protein_g").gte("logged_on", from14)),
    q<RawCoachData["projects"]>(supabase.from("projects").select("name,stage,features_total,features_done").neq("stage", "completed").limit(10)),
    q<{ status: string }[]>(supabase.from("freelance_leads").select("status")),
    q<RawCoachData["outreach"]>(supabase.from("outreach_log").select("kind,occurred_on").gte("occurred_on", from14)),
    q<{ amount: number | string; currency: string }[]>(supabase.from("income_records").select("amount,currency").eq("kind", "payment").gte("occurred_on", startOfMonth(today))),
  ]);

  const { overall, category } = curvesFromSettings(settings);
  const character = buildCharacter(progress.xp_by_category, overall, category);
  const raw: RawCoachData = {
    today, timezone: profile.timezone,
    settings: { availability: settings.availability, daily_task_limit: settings.daily_task_limit, mvd_minutes: settings.mvd_minutes, currency: settings.currency, targets: settings.targets as unknown as Record<string, number | null>, goals: settings.goals as RawCoachData["settings"]["goals"] },
    progress, levels: { overall: character.overall.level, categories: Object.fromEntries(Object.entries(character.categories).map(([k, v]) => [k, v.level])) as RawCoachData["levels"]["categories"] },
    tasks, completions: completions.filter((c) => c.tasks).map((c) => ({ title: c.tasks!.title, category: c.category, difficulty: c.tasks!.difficulty, completed_on: c.completed_on, xp: c.xp_awarded })),
    xpRows, activeDates: [...new Set(active.map((a) => a.completed_on))], exams, subjects, syllabus, focus, practice, workouts,
    health: health.map((h) => ({ ...h, sleep_hours: h.sleep_hours == null ? null : Number(h.sleep_hours) })),
    proteinByDay: protein.reduce<Record<YMD, number>>((a, p) => ((a[p.logged_on] = (a[p.logged_on] ?? 0) + Number(p.protein_g)), a), {}),
    projects, leadStatuses: leads.map((l) => l.status), outreach,
    incomeThisMonth: income.filter((i) => i.currency === settings.currency).reduce((a, i) => a + Number(i.amount), 0),
  };
  return shapeCoachContext(raw);
}
