import { CATEGORY_KEYS, type AnyCategory, type CategoryKey } from "../constants";
import { addDays, diffDays, isoWeekday, type YMD } from "../dates";
import type { XpRow } from "../game/analytics";
import { availableMinutes, RECOMMENDED_FRACTION } from "../game/planner";
import { syllabusProgress, type SyllabusNode } from "../game/domain";

// What the AI coach is allowed to see. This is the ONLY place that decides it, and it is pure so tests can prove
// that nothing private (email, notes, contact details, lead names, journal text) can leak into a request.

export type RawCoachData = {
  today: YMD;
  timezone: string;
  settings: { availability: Record<string, number>; daily_task_limit: number; mvd_minutes: number; currency: string; targets: Record<string, number | null>; goals: Record<string, { goal?: string | null; level?: string } | undefined> };
  progress: { xp_by_category: Partial<Record<AnyCategory, number>>; current_streak: number; best_streak: number };
  levels: { overall: number; categories: Record<CategoryKey, number> };
  tasks: { title: string; category: AnyCategory; difficulty: string; quest_type: string; priority: number; est_minutes: number | null; scheduled_date: YMD | null; due_date: YMD | null; status: string; template_id: string | null }[];
  completions: { title: string; category: AnyCategory; difficulty: string; completed_on: YMD; xp: number }[];
  xpRows: XpRow[];
  activeDates: YMD[];
  exams: { title: string; exam_date: YMD; subject_id: string | null }[];
  subjects: { id: string; name: string; weekly_target_min: number }[];
  syllabus: (SyllabusNode)[];
  focus: { category: string; session_date: YMD; minutes: number; subject_id: string | null }[];
  practice: { session_date: YMD; duration_min: number | null; intensity: number | null; status: string }[];
  workouts: { workout_date: YMD; duration_min: number | null }[];
  health: { day: YMD; water_ml: number; sleep_hours: number | null; mobility_min: number; is_rest_day: boolean }[];
  proteinByDay: Record<YMD, number>;
  projects: { name: string; stage: string; features_total: number; features_done: number }[];
  leadStatuses: string[];
  outreach: { kind: string; occurred_on: YMD }[];
  incomeThisMonth: number;
};

const clip = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function shapeCoachContext(d: RawCoachData) {
  const { today } = d;
  const from14 = addDays(today, -13), from7 = addDays(today, -6);
  const fmt = (t: RawCoachData["tasks"][number]) => ({ title: clip(t.title), area: t.category, difficulty: t.difficulty, type: t.quest_type, priority: t.priority, est_min: t.est_minutes, scheduled: t.scheduled_date, due: t.due_date });
  const open = d.tasks.filter((t) => t.status === "open");
  const live = (t: RawCoachData["tasks"][number]) => !t.template_id || (t.scheduled_date ?? today) >= today; // missed habit copies are history
  const free = availableMinutes(today, d.settings);
  const xp7: Record<string, number> = {}, xp14: Record<string, number> = {};
  for (const r of d.xpRows) {
    if (r.day >= from14) xp14[r.category] = (xp14[r.category] ?? 0) + r.xp;
    if (r.day >= from7) xp7[r.category] = (xp7[r.category] ?? 0) + r.xp;
  }
  const minutes: Record<string, number> = { basketball: 0, college: 0, dev: 0, health: 0 };
  for (const f of d.focus) if (f.session_date >= from14 && f.category in minutes) minutes[f.category] += f.minutes;
  for (const p of d.practice) if (p.status === "done" && p.session_date >= from14) minutes.basketball += p.duration_min ?? 0;
  for (const w of d.workouts) if (w.workout_date >= from14) minutes.health += w.duration_min ?? 0;
  const week = d.health.filter((h) => h.day >= from7);
  const sleepVals = week.map((h) => h.sleep_hours).filter((v): v is number => v != null);
  const subjectName = new Map(d.subjects.map((s) => [s.id, s.name]));
  const active14 = d.activeDates.filter((x) => x >= from14 && x <= today).length;
  const firstActive = [...d.activeDates].sort()[0] ?? null;
  const planned14 = d.tasks.filter((t) => t.scheduled_date && t.scheduled_date >= from14 && t.scheduled_date <= today);
  const doneCount = d.completions.filter((c) => c.completed_on >= from14).length;
  const targets = d.settings.targets;

  return {
    today, weekday: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][isoWeekday(today) - 1], timezone: d.timezone,
    character: {
      overall_level: d.levels.overall, total_xp: Object.values(d.progress.xp_by_category).reduce((a, b) => a + (b ?? 0), 0),
      streak_days: d.progress.current_streak, best_streak_days: d.progress.best_streak,
      attributes: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, { level: d.levels.categories[k], xp_total: d.progress.xp_by_category[k] ?? 0, xp_last_7d: xp7[k] ?? 0, xp_last_14d: xp14[k] ?? 0 }])),
    },
    goals: Object.fromEntries(Object.entries(d.settings.goals).filter(([, v]) => v?.goal).map(([k, v]) => [k, { goal: clip(String(v!.goal), 200), starting_level: v!.level ?? null }])),
    capacity_today: { free_minutes: free, recommended_minutes: Math.round(free * RECOMMENDED_FRACTION), max_quests_per_day: d.settings.daily_task_limit, minimum_viable_day_minutes: d.settings.mvd_minutes },
    quests: {
      today: open.filter((t) => t.scheduled_date === today).map(fmt),
      carried_over: open.filter((t) => t.scheduled_date && t.scheduled_date < today && !t.template_id).map(fmt).slice(0, 15),
      upcoming_7d: open.filter((t) => t.scheduled_date && t.scheduled_date > today && t.scheduled_date <= addDays(today, 7) && live(t)).map(fmt).slice(0, 20),
      backlog: open.filter((t) => !t.scheduled_date).map(fmt).slice(0, 15),
    },
    last_7_days: {
      completed: d.completions.filter((c) => c.completed_on >= from7).slice(0, 30).map((c) => ({ title: clip(c.title), area: c.category, difficulty: c.difficulty, date: c.completed_on })),
    },
    last_14_days: {
      active_days: active14, quests_completed: doneCount,
      completion_rate: planned14.length ? Math.round((planned14.filter((t) => t.status === "done").length / Math.max(1, planned14.filter((t) => t.status === "done" || t.status === "open").length)) * 100) / 100 : null,
      logged_minutes_by_area: minutes,
      practice_sessions: d.practice.filter((p) => p.status === "done" && p.session_date >= from14).length,
      workouts: d.workouts.filter((w) => w.workout_date >= from14).length,
      rest_days_marked: d.health.filter((h) => h.is_rest_day && h.day >= from14).length,
      xp_by_day: Array.from({ length: 14 }, (_, i) => { const day = addDays(from14, i); return { day, xp: d.xpRows.filter((r) => r.day === day).reduce((a, r) => a + r.xp, 0) }; }),
    },
    weekly_targets: {
      study_minutes: { target: targets.study_weekly_min ?? null, logged_last_7d: d.focus.filter((f) => f.category === "college" && f.session_date >= from7).reduce((a, f) => a + f.minutes, 0) },
      coding_minutes: { target: targets.coding_weekly_min ?? null, logged_last_7d: d.focus.filter((f) => f.category === "dev" && f.session_date >= from7).reduce((a, f) => a + f.minutes, 0) },
      practice_days: { target: targets.practice_weekly ?? null, logged_last_7d: new Set(d.practice.filter((p) => p.status === "done" && p.session_date >= from7).map((p) => p.session_date)).size },
      workouts: { target: targets.workouts_weekly ?? null, logged_last_7d: d.workouts.filter((w) => w.workout_date >= from7).length },
    },
    exams: d.exams.filter((e) => e.exam_date >= today).slice(0, 8).map((e) => {
      const nodes = e.subject_id ? d.syllabus.filter((n) => n.subject_id === e.subject_id) : [];
      const p = syllabusProgress(nodes);
      return { title: clip(e.title), subject: e.subject_id ? subjectName.get(e.subject_id) ?? null : null, date: e.exam_date, days_left: diffDays(today, e.exam_date), syllabus_done_pct: p.total ? Math.round((p.done / p.total) * 100) : null };
    }),
    projects: d.projects.slice(0, 8).map((p) => ({ name: clip(p.name, 60), stage: p.stage, features: `${p.features_done}/${p.features_total}` })),
    freelance: {
      leads_by_status: d.leadStatuses.reduce<Record<string, number>>((a, s) => ((a[s] = (a[s] ?? 0) + 1), a), {}),
      outreach_sent_14d: d.outreach.filter((o) => ["message", "followup", "proposal"].includes(o.kind) && o.occurred_on >= from14).length,
      income_received_this_month: d.incomeThisMonth, monthly_income_target: targets.income_monthly ?? null, currency: d.settings.currency,
    },
    health_last_7d: {
      average_sleep_hours: sleepVals.length ? Math.round((sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length) * 10) / 10 : null, nights_logged: sleepVals.length,
      healthy_sleep_range_hours: [targets.sleep_min_h ?? null, targets.sleep_max_h ?? null],
      days_hit_water_target: week.filter((h) => targets.water_ml && h.water_ml >= Number(targets.water_ml)).length,
      days_hit_protein_target: Object.entries(d.proteinByDay).filter(([day, g]) => day >= from7 && targets.protein_g && g >= Number(targets.protein_g)).length,
    },
    data_quality: { first_active_day: firstActive, days_of_history: firstActive ? diffDays(firstActive, today) + 1 : 0, total_active_days: d.activeDates.length },
  };
}

export type CoachContext = ReturnType<typeof shapeCoachContext>;

/** Plain-language list shown to the user next to the consent switch. Keep in step with shapeCoachContext. */
export const COACH_DISCLOSURE = {
  sent: [
    "Today's date and your time zone (no name, no email).",
    "Your level, XP, streak and per-area progress.",
    "Titles, area, difficulty, estimate and dates of your open and recently completed quests.",
    "Weekly targets and minutes logged per area (study, coding, practice, workouts).",
    "Exam names and dates, subject names and syllabus percentages, project names and stages.",
    "Counts only for freelancing: leads by status, outreach sent, income received this month against your target.",
    "Seven-day averages for sleep, water and protein targets hit.",
    "The goal sentences you wrote in onboarding or Settings, and any text you type into the coach.",
  ],
  never: [
    "Your email, password or login details.",
    "Notes, descriptions, journal-style text, practice or workout notes.",
    "Lead and client names, contact details, invoice or payment details.",
    "Body measurements and bodyweight.",
  ],
} as const;
