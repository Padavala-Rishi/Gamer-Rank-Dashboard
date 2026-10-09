import { addDays, daysInMonth, diffDays, isoWeekday, weekStart, type YMD } from "../dates";

// Repeating quests are stored as a template with a rule; dated occurrences are generated on demand.

export type Recurrence = {
  freq: "daily" | "weekly" | "monthly";
  interval?: number;       // every N days / weeks / months (default 1)
  weekdays?: number[];     // weekly: ISO weekdays 1..7 (default: the start date's weekday)
  monthday?: number;       // monthly: 1..31 (clamped to the month's length; default: start day)
  start: YMD;
  until?: YMD | null;
};

export function describeRecurrence(r: Recurrence): string {
  const n = r.interval && r.interval > 1 ? r.interval : 1;
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (r.freq === "daily") return n === 1 ? "Every day" : `Every ${n} days`;
  if (r.freq === "weekly") {
    const days = (r.weekdays?.length ? r.weekdays : [isoWeekday(r.start)]).slice().sort((a, b) => a - b).map((d) => names[d - 1]).join(", ");
    return `${n === 1 ? "Every week" : `Every ${n} weeks`} on ${days}`;
  }
  return `${n === 1 ? "Every month" : `Every ${n} months`} on day ${r.monthday ?? Number(r.start.slice(8, 10))}`;
}

export function occursOn(r: Recurrence, date: YMD): boolean {
  if (date < r.start) return false;
  if (r.until && date > r.until) return false;
  const n = Math.max(1, Math.floor(r.interval ?? 1));
  if (r.freq === "daily") return diffDays(r.start, date) % n === 0;
  if (r.freq === "weekly") {
    const days = r.weekdays?.length ? r.weekdays : [isoWeekday(r.start)];
    if (!days.includes(isoWeekday(date))) return false;
    const weeks = diffDays(weekStart(r.start, 1), weekStart(date, 1)) / 7;
    return weeks % n === 0;
  }
  // monthly
  const sy = +r.start.slice(0, 4), sm = +r.start.slice(5, 7);
  const dy = +date.slice(0, 4), dm = +date.slice(5, 7);
  const months = (dy - sy) * 12 + (dm - sm);
  if (months < 0 || months % n !== 0) return false;
  const want = Math.min(r.monthday ?? Number(r.start.slice(8, 10)), daysInMonth(date));
  return Number(date.slice(8, 10)) === want;
}

/** All occurrence dates in [from, to], inclusive. Capped to protect against absurd ranges. */
export function occurrencesBetween(r: Recurrence, from: YMD, to: YMD, cap = 400): YMD[] {
  const out: YMD[] = [];
  for (let d = from < r.start ? r.start : from; d <= to && out.length < cap; d = addDays(d, 1)) {
    if (occursOn(r, d)) out.push(d);
  }
  return out;
}

export function isRecurrence(x: unknown): x is Recurrence {
  const r = x as Recurrence;
  return !!r && typeof r === "object" && ["daily", "weekly", "monthly"].includes(r.freq) && typeof r.start === "string";
}
