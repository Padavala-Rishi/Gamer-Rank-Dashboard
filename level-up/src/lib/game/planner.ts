import { addDays, diffDays, formatMinutes, weekdayKey, type YMD } from "../dates";
import { CATEGORIES, CATEGORY_KEYS, type AnyCategory, type CategoryKey } from "../constants";

// Planning rules. The aim is a day you can actually finish, not the longest possible list.
//   recommended = 80% of the free time you declared; full = 100%; hard stop = 115%, or your task-count limit.

export const RECOMMENDED_FRACTION = 0.8;
export const HARD_FRACTION = 1.15;
export const DEFAULT_TASK_MINUTES = 30;

export type PlannerTask = {
  id: string;
  title: string;
  category: AnyCategory;
  difficulty: "easy" | "medium" | "hard" | "boss";
  priority: number;
  est_minutes: number | null;
  scheduled_date: YMD | null;
  due_date?: YMD | null;
  status: string;
  quest_type?: string;
  subject_id?: string | null;
  parent_id?: string | null;
  template_id?: string | null;
};

export type PlannerSettings = {
  availability: Record<string, number>;
  daily_task_limit: number;
  mvd_minutes: number;
};

export const isLiveTask = (t: PlannerTask) => t.status === "open";

export function availableMinutes(date: YMD, s: PlannerSettings): number {
  const v = s.availability?.[weekdayKey(date)];
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export type DayLoad = { count: number; minutes: number; estimatedCount: number };

/** Planned load of the open quests on a day. Quests without an estimate count as 30 min and are flagged. */
export function dayLoad(tasks: PlannerTask[], date: YMD): DayLoad {
  let count = 0, minutes = 0, estimatedCount = 0;
  for (const t of tasks) {
    if (t.status !== "open" || t.scheduled_date !== date) continue;
    count++;
    if (t.est_minutes == null) { minutes += DEFAULT_TASK_MINUTES; estimatedCount++; } else minutes += t.est_minutes;
  }
  return { count, minutes, estimatedCount };
}

export type Workload = { tasks: number; minutes: number; free: number };
export function recommendedWorkload(date: YMD, s: PlannerSettings, mvd = false): Workload {
  const free = availableMinutes(date, s);
  const minutes = mvd ? Math.min(s.mvd_minutes, Math.round(free * RECOMMENDED_FRACTION)) : Math.round(free * RECOMMENDED_FRACTION);
  const avg = 35;
  const tasks = Math.max(1, Math.min(s.daily_task_limit, Math.round(minutes / avg) || 1));
  return { tasks: mvd ? Math.min(3, tasks) : tasks, minutes, free };
}

export type ScheduleCheck = {
  verdict: "ok" | "full" | "blocked";
  message: string | null;
  after: DayLoad;
  free: number;
  recommendedMinutes: number;
  hardMinutes: number;
  suggestedDate: YMD | null;
};

/**
 * Can another quest of `addMinutes` be scheduled on `date`?
 *   ok      – fits inside the recommended load
 *   full    – over the recommendation but within the day's free time (allowed, with a heads-up)
 *   blocked – would exceed the hard stop (115% of free time) or the daily task limit
 */
export function checkSchedule(args: {
  tasks: PlannerTask[];
  date: YMD;
  addMinutes: number | null;
  settings: PlannerSettings;
  /** exclude this task from the existing load (when moving/editing it) */
  ignoreId?: string;
  mvd?: boolean;
}): ScheduleCheck {
  const { date, settings } = args;
  const existing = args.tasks.filter((t) => t.id !== args.ignoreId);
  const load = dayLoad(existing, date);
  const add = args.addMinutes ?? DEFAULT_TASK_MINUTES;
  const after: DayLoad = { count: load.count + 1, minutes: load.minutes + add, estimatedCount: load.estimatedCount + (args.addMinutes == null ? 1 : 0) };
  const free = availableMinutes(date, settings);
  const recommended = Math.round(free * RECOMMENDED_FRACTION);
  const hard = Math.round(free * HARD_FRACTION);
  let verdict: ScheduleCheck["verdict"] = "ok";
  let message: string | null = null;

  if (after.count > settings.daily_task_limit) {
    verdict = "blocked";
    message = `That would make ${after.count} quests on one day. Your limit is ${settings.daily_task_limit}. Move something, or raise the limit in Settings.`;
  } else if (after.minutes > hard) {
    verdict = "blocked";
    message = `That would plan ${formatMinutes(after.minutes)} but you have about ${formatMinutes(free)} free. A realistic day is ~${formatMinutes(recommended)}.`;
  } else if (after.minutes > free) {
    verdict = "full";
    message = `Planned time (${formatMinutes(after.minutes)}) is slightly over your free time (${formatMinutes(free)}).`;
  } else if (after.minutes > recommended) {
    verdict = "full";
    message = `That fills the day: ${formatMinutes(after.minutes)} of ~${formatMinutes(free)} free. Keep a buffer.`;
  }

  let suggestedDate: YMD | null = null;
  if (verdict !== "ok") {
    for (let i = 1; i <= 14; i++) {
      const d = addDays(date, i);
      const l = dayLoad(existing, d);
      const f = availableMinutes(d, settings);
      if (l.count + 1 <= settings.daily_task_limit && l.minutes + add <= Math.round(f * RECOMMENDED_FRACTION)) { suggestedDate = d; break; }
    }
  }
  return { verdict, message, after, free, recommendedMinutes: recommended, hardMinutes: hard, suggestedDate };
}

// ───────────────────────── Minimum Viable Day ─────────────────────────

const PRIORITY_WEIGHT: Record<number, number> = { 1: 30, 2: 15, 3: 0 };

/** The smallest set of quests that still makes today count: ≤ 3 quests and within the MVD time budget. */
export function pickMinimumViableDay(tasks: PlannerTask[], today: YMD, settings: PlannerSettings): PlannerTask[] {
  const cands = tasks
    .filter((t) => t.status === "open" && t.scheduled_date != null && t.scheduled_date <= today)
    .map((t) => ({
      t,
      score:
        (PRIORITY_WEIGHT[t.priority] ?? 15) +
        (t.scheduled_date! < today ? 8 : 12) +
        (t.due_date && t.due_date <= addDays(today, 1) ? 20 : 0) +
        (t.quest_type === "recovery" || t.quest_type === "habit" ? 6 : 0) -
        (t.difficulty === "boss" ? 25 : t.difficulty === "hard" ? 10 : 0) -
        Math.min((t.est_minutes ?? DEFAULT_TASK_MINUTES) / 10, 12),
    }))
    .sort((a, b) => b.score - a.score);
  const picked: PlannerTask[] = [];
  let used = 0;
  const usedCats = new Set<string>();
  // first pass: favour variety across life areas
  for (const pass of [true, false]) {
    for (const { t } of cands) {
      if (picked.length >= 3 || picked.includes(t)) continue;
      if (pass && usedCats.has(t.category)) continue;
      const m = t.est_minutes ?? DEFAULT_TASK_MINUTES;
      if (used + m > settings.mvd_minutes && picked.length > 0) continue;
      picked.push(t); used += m; usedCats.add(t.category);
    }
  }
  return picked;
}

// ───────────────────────── Next Best Action ─────────────────────────

export type ExamLite = { id: string; subject_id: string | null; title: string; exam_date: YMD; status: string };

export type NbaContext = {
  today: YMD;
  /** minutes left in today's plan budget; null = unknown */
  minutesLeft?: number | null;
  exams?: ExamLite[];
  /** recorded activity per category over the last 7 days (XP); used to nudge neglected areas */
  recentXp?: Partial<Record<AnyCategory, number>>;
  /** open child counts: parents with open children are not suggested before them */
  openChildren?: Set<string>;
};

export type Recommendation<T extends PlannerTask = PlannerTask> = { task: T; score: number; reasons: string[] };

export function nextBestActions<T extends PlannerTask>(tasks: T[], ctx: NbaContext, limit = 3): Recommendation<T>[] {
  const { today } = ctx;
  const nearest = (subjectId: string | null | undefined) => {
    if (!subjectId) return null;
    const e = (ctx.exams ?? []).filter((x) => x.subject_id === subjectId && x.status === "upcoming" && x.exam_date >= today).sort((a, b) => (a.exam_date < b.exam_date ? -1 : 1))[0];
    return e ? { exam: e, days: diffDays(today, e.exam_date) } : null;
  };
  const xp = ctx.recentXp ?? {};
  const totalXp = CATEGORY_KEYS.reduce((a, k) => a + (xp[k] ?? 0), 0);
  const neglected = new Set<CategoryKey>();
  if (totalXp >= 50) for (const k of CATEGORY_KEYS) if ((xp[k] ?? 0) / totalXp < 0.08) neglected.add(k);

  const recs: Recommendation<T>[] = [];
  for (const t of tasks) {
    if (t.status !== "open") continue;
    if (t.scheduled_date && t.scheduled_date > today) continue;
    if (ctx.openChildren?.has(t.id)) continue;
    const reasons: string[] = [];
    let score = PRIORITY_WEIGHT[t.priority] ?? 15;
    if (t.priority === 1) reasons.push("High priority");

    if (t.scheduled_date && t.scheduled_date < today) {
      const late = diffDays(t.scheduled_date, today);
      if (!t.template_id) { score += 22 + Math.min(late, 7) * 2; reasons.push(`Carried over from ${late === 1 ? "yesterday" : `${late} days ago`}`); }
      else score -= 10; // missed habit instances aren't urgent
    } else if (t.scheduled_date === today) { score += 18; reasons.push("Planned for today"); }

    if (t.due_date) {
      const left = diffDays(today, t.due_date);
      if (left < 0) { score += 30; reasons.push("Past its deadline"); }
      else if (left === 0) { score += 28; reasons.push("Due today"); }
      else if (left === 1) { score += 18; reasons.push("Due tomorrow"); }
      else if (left <= 3) { score += 8; reasons.push(`Due in ${left} days`); }
    }
    const ex = nearest(t.subject_id);
    if (ex && ex.days <= 14) {
      const bump = ex.days <= 3 ? 35 : ex.days <= 7 ? 25 : 12;
      score += bump; reasons.push(`${ex.exam.title} is in ${ex.days === 0 ? "less than a day" : ex.days === 1 ? "1 day" : `${ex.days} days`}`);
    }
    if (t.category !== "life" && neglected.has(t.category as CategoryKey)) {
      score += 12; reasons.push(`${CATEGORIES[t.category].name} has had little attention this week`);
    }
    const est = t.est_minutes ?? DEFAULT_TASK_MINUTES;
    if (ctx.minutesLeft != null) {
      if (est <= ctx.minutesLeft) { score += 5; if (reasons.length < 3) reasons.push("Fits the time you have left today"); }
      else { score -= 12; }
    }
    if (t.parent_id) { score += 4; reasons.push("Part of a Boss Quest"); }
    recs.push({ task: t, score, reasons: reasons.slice(0, 3) });
  }
  recs.sort((a, b) => b.score - a.score || (a.task.est_minutes ?? 30) - (b.task.est_minutes ?? 30));
  return recs.slice(0, limit);
}

// ───────────────────────── grouping helpers ─────────────────────────

export type QuestBuckets<T extends PlannerTask> = { today: T[]; overdue: T[]; upcoming: T[]; backlog: T[]; };

export function bucketTasks<T extends PlannerTask>(tasks: T[], today: YMD): QuestBuckets<T> {
  const out: QuestBuckets<T> = { today: [], overdue: [], upcoming: [], backlog: [] };
  for (const t of tasks) {
    if (t.status !== "open") continue;
    if (!t.scheduled_date) out.backlog.push(t);
    else if (t.scheduled_date === today) out.today.push(t);
    // missed instances of repeating quests are history, not overdue
    else if (t.scheduled_date < today) { if (!t.template_id) out.overdue.push(t); }
    else out.upcoming.push(t);
  }
  const byOrder = (a: T, b: T) => a.priority - b.priority;
  out.today.sort(byOrder);
  out.overdue.sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1));
  out.upcoming.sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1));
  return out;
}

/** Open quests worth showing now: future copies of repeating quests are hidden until their day (no "Evening stretch" ×4). */
export function visibleNow<T extends PlannerTask>(tasks: T[], today: YMD): T[] {
  return tasks.filter((t) => !(t.template_id && t.scheduled_date && t.scheduled_date > today));
}

/** For "coming up" lists: one entry per repeating quest (its next occurrence), every one-off quest. */
export function nextOccurrences<T extends PlannerTask>(tasks: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of tasks.slice().sort((a, b) => ((a.scheduled_date ?? "9999") < (b.scheduled_date ?? "9999") ? -1 : 1))) {
    if (t.template_id) { if (seen.has(t.template_id)) continue; seen.add(t.template_id); }
    out.push(t);
  }
  return out;
}
