// Habit scheduling and statistics.
//
// Design choices (anti all-or-nothing):
//  - "minimum" counts as showing up: it keeps the streak alive and is shown separately.
//  - "skipped" is an intentional rest: neutral, it neither breaks nor extends a streak.
//  - Today never breaks a streak until the day is over.
//  - Paused habits are not scheduled.
import { addDays, eachDay, startOfWeek, weekday } from "./dates";

export interface HabitLike {
  frequency: "daily" | "days" | "weekly" | string;
  days: number[];
  times_per_week: number | null;
  paused?: boolean;
  created_at: string; // ISO instant
}

export interface HabitLogLike {
  date: string;
  status: "done" | "minimum" | "skipped" | string;
}

export interface HabitStats {
  currentStreak: number;
  bestStreak: number;
  streakUnit: "days" | "weeks";
  consistency30: number | null; // 0..1, null when nothing was scheduled yet
  done30: number;
  minimum30: number;
  skipped30: number;
  scheduled30: number;
  todayStatus: string | null;
  scheduledToday: boolean;
  weekProgress: { done: number; target: number } | null;
}

export function isScheduled(h: HabitLike, date: string): boolean {
  if (h.frequency === "daily") return true;
  if (h.frequency === "days") return h.days.includes(weekday(date));
  return true; // weekly: any day can count toward the weekly target
}

const success = (s: string | undefined) => s === "done" || s === "minimum";

export function habitStats(h: HabitLike, logs: HabitLogLike[], today: string, weekStartDay = 1, createdDate?: string): HabitStats {
  const byDate = new Map(logs.map((l) => [l.date, l.status]));
  const created = createdDate ?? h.created_at.slice(0, 10);
  // Logs before the creation date (e.g. backfilled) still count as history.
  const firstLog = logs.reduce<string | null>((m, l) => (m == null || l.date < m ? l.date : m), null);
  const start = firstLog && firstLog < created ? firstLog : created;
  const todayStatus = byDate.get(today) ?? null;

  const windowStart = addDays(today, -29) > start ? addDays(today, -29) : start;
  let done30 = 0,
    minimum30 = 0,
    skipped30 = 0,
    scheduled30 = 0;
  if (windowStart <= today) {
    for (const d of eachDay(windowStart, today)) {
      const s = byDate.get(d);
      if (s === "done") done30++;
      else if (s === "minimum") minimum30++;
      else if (s === "skipped") skipped30++;
      if (h.frequency !== "weekly" && isScheduled(h, d) && s !== "skipped" && (d < today || success(s))) scheduled30++;
    }
  }

  if (h.frequency === "weekly") {
    const target = Math.max(1, h.times_per_week ?? 1);
    const weekOf = (d: string) => startOfWeek(d, weekStartDay);
    const counts = new Map<string, { ok: number; skip: number }>();
    for (const l of logs) {
      const w = weekOf(l.date);
      const c = counts.get(w) ?? { ok: 0, skip: 0 };
      if (success(l.status)) c.ok++;
      else if (l.status === "skipped") c.skip++;
      counts.set(w, c);
    }
    const met = (w: string) => {
      const c = counts.get(w);
      return !!c && c.ok >= Math.max(0, target - c.skip) && (c.ok > 0 || c.skip > 0);
    };
    const thisWeek = weekOf(today);
    const firstWeek = weekOf(start);
    let current = 0;
    let w = thisWeek;
    if (met(w)) current++;
    w = addDays(w, -7);
    while (w >= firstWeek && met(w)) {
      current++;
      w = addDays(w, -7);
    }
    let best = 0,
      run = 0;
    for (let x = firstWeek; x <= thisWeek; x = addDays(x, 7)) {
      if (met(x)) best = Math.max(best, ++run);
      else if (x !== thisWeek) run = 0;
    }
    // Consistency: average share of the weekly target reached over the last 4 completed
    // weeks (plus the current week once it is met). Skips lower that week's target.
    const ratios: number[] = [];
    if (met(thisWeek)) ratios.push(1);
    for (let i = 1; i <= 4; i++) {
      const wk = addDays(thisWeek, -7 * i);
      if (addDays(wk, 6) < start) break;
      const c = counts.get(wk);
      const need = Math.max(0, target - (c?.skip ?? 0));
      ratios.push(need === 0 ? 1 : Math.min(1, (c?.ok ?? 0) / need));
    }
    const c = counts.get(thisWeek);
    return {
      currentStreak: current,
      bestStreak: Math.max(best, current),
      streakUnit: "weeks",
      consistency30: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
      done30,
      minimum30,
      skipped30,
      scheduled30: ratios.length * target,
      todayStatus,
      scheduledToday: !h.paused,
      weekProgress: { done: c?.ok ?? 0, target },
    };
  }

  // Daily / specific days
  let current = 0;
  for (let d = today; d >= start; d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    const s = byDate.get(d);
    if (success(s)) current++;
    else if (s === "skipped") continue;
    else if (d === today) continue;
    else break;
    if (current > 5000) break;
  }
  let best = 0,
    run = 0;
  if (start <= today) {
    for (const d of eachDay(start, today)) {
      if (!isScheduled(h, d)) continue;
      const s = byDate.get(d);
      if (success(s)) best = Math.max(best, ++run);
      else if (s === "skipped" || d === today) continue;
      else run = 0;
    }
  }
  return {
    currentStreak: current,
    bestStreak: Math.max(best, current),
    streakUnit: "days",
    consistency30: scheduled30 ? (done30 + minimum30) / scheduled30 : null,
    done30,
    minimum30,
    skipped30,
    scheduled30,
    todayStatus,
    scheduledToday: !h.paused && isScheduled(h, today),
    weekProgress: null,
  };
}
