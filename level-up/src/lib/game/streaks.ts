import { addDays, diffDays, isoWeekday, weekStart, type YMD } from "../dates";

// Mirrors public._streaks() in SQL (tests/db/parity.test.ts checks they agree).
//  • A day is ACTIVE if at least one quest was completed that local day.
//  • A planned rest day (marked in Health, or a configured rest weekday) neither adds to nor breaks a streak.
//  • Today may still be open: the streak is "at risk", not broken, until the day ends.

export type StreakInput = {
  activeDates: Iterable<YMD>;
  restDates?: Iterable<YMD>;
  restWeekdays?: number[]; // ISO 1..7
  today: YMD;
};

export type Streaks = { current: number; best: number; /** today has no quest yet and the streak would grow if it did */ atRisk: boolean };

export function computeStreaks({ activeDates, restDates = [], restWeekdays = [], today }: StreakInput): Streaks {
  const active = new Set(activeDates);
  if (active.size === 0) return { current: 0, best: 0, atRisk: false };
  const rest = new Set(restDates);
  const wd = new Set(restWeekdays);
  const isRest = (d: YMD) => rest.has(d) || wd.has(isoWeekday(d));
  const first = [...active].sort()[0];

  let best = 0, run = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (active.has(d)) { run++; best = Math.max(best, run); }
    else if (isRest(d)) { /* bridges */ }
    else run = 0;
  }

  let cur = 0;
  let d = today;
  if (!active.has(d) && !isRest(d)) d = addDays(d, -1);
  for (; d >= first; d = addDays(d, -1)) {
    if (active.has(d)) cur++;
    else if (isRest(d)) continue;
    else break;
  }
  return { current: cur, best, atRisk: cur > 0 && !active.has(today) };
}

export type WeeklyInput = {
  activeDates: Iterable<YMD>;
  restDates?: Iterable<YMD>;
  today: YMD;
  weekStartsOn?: 0 | 1;
  /** active (or planned-rest) days needed for a week to count */
  minDays?: number;
};

/** Consecutive weeks (ending with the current or last completed week) that met the minimum. */
export function weeklyStreak({ activeDates, restDates = [], today, weekStartsOn = 1, minDays = 4 }: WeeklyInput): { current: number; best: number; thisWeekDays: number } {
  const days = new Set<YMD>([...activeDates, ...restDates]);
  if (days.size === 0) return { current: 0, best: 0, thisWeekDays: 0 };
  const countWeek = (ws: YMD) => { let n = 0; for (let i = 0; i < 7; i++) if (days.has(addDays(ws, i))) n++; return n; };
  const thisWs = weekStart(today, weekStartsOn);
  const firstWs = weekStart([...days].sort()[0], weekStartsOn);
  let best = 0, run = 0;
  for (let ws = firstWs; ws <= thisWs; ws = addDays(ws, 7)) {
    if (countWeek(ws) >= minDays) { run++; best = Math.max(best, run); } else if (ws !== thisWs) run = 0;
  }
  // current: the in-progress week only counts if it already qualifies; otherwise start from last week
  let cur = 0;
  let ws = countWeek(thisWs) >= minDays ? thisWs : addDays(thisWs, -7);
  while (ws >= firstWs && countWeek(ws) >= minDays) { cur++; ws = addDays(ws, -7); }
  return { current: cur, best, thisWeekDays: countWeek(thisWs) };
}

/** Share (0..1) of the last `days` days that were active or planned rest. Rest days count as "kept". */
export function consistency({ activeDates, restDates = [], restWeekdays = [], today, days }: StreakInput & { days: number }): { kept: number; days: number; pct: number } {
  const active = new Set(activeDates), rest = new Set(restDates), wd = new Set(restWeekdays);
  let kept = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    if (active.has(d) || rest.has(d) || wd.has(isoWeekday(d))) kept++;
  }
  return { kept, days, pct: days ? kept / days : 0 };
}

export { diffDays };
