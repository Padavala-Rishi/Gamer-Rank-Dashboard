// Calendar expansion, conflict detection and capacity maths.
import { addDays, dateInTz, eachDay, minutesInTz, minutesToTime, timeToMinutes, weekday, zonedToUtc } from "./dates";

export interface EventLike {
  id: string;
  title: string;
  kind: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  recurrence: string; // none | daily | weekdays | weekly
  recurrence_until: string | null;
  [k: string]: unknown;
}

export interface Occurrence extends EventLike {
  occurrence_key: string; // unique per occurrence (id + date)
  occurrence_date: string; // local date of the occurrence start
  is_recurring: boolean;
}

/** Expands events (including repeating ones) into concrete occurrences overlapping [from, to] (local dates). */
export function expandEvents<T extends EventLike>(events: T[], from: string, to: string, tz: string): (Occurrence & T)[] {
  const out: (Occurrence & T)[] = [];
  for (const e of events) {
    const startDate = dateInTz(e.start_at, tz);
    if (!e.recurrence || e.recurrence === "none") {
      const endDate = dateInTz(e.end_at, tz);
      if (endDate >= from && startDate <= to) {
        out.push({ ...e, occurrence_key: `${e.id}:${startDate}`, occurrence_date: startDate, is_recurring: false });
      }
      continue;
    }
    const durationMs = Date.parse(e.end_at) - Date.parse(e.start_at);
    const localStart = minutesToTime(minutesInTz(e.start_at, tz));
    const baseWeekday = weekday(startDate);
    const first = startDate > from ? startDate : addDays(from, -1); // include one day before for overnight events
    const last = e.recurrence_until && e.recurrence_until < to ? e.recurrence_until : to;
    if (first > last) continue;
    for (const d of eachDay(first, last)) {
      const wd = weekday(d);
      const match =
        e.recurrence === "daily" ||
        (e.recurrence === "weekdays" && wd >= 1 && wd <= 5) ||
        (e.recurrence === "weekly" && wd === baseWeekday);
      if (!match || d < startDate) continue;
      const start = zonedToUtc(d, localStart, tz);
      const end = new Date(Date.parse(start) + durationMs).toISOString();
      if (dateInTz(end, tz) < from) continue;
      out.push({ ...e, start_at: start, end_at: end, occurrence_key: `${e.id}:${d}`, occurrence_date: d, is_recurring: true });
    }
  }
  return out.sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export interface Conflict {
  a: string; // occurrence_key
  b: string;
  overlapMin: number;
}

/** Kinds that don't count as commitments competing for the same time. */
const NON_BLOCKING = new Set(["sleep"]);

export function findConflicts(occ: Occurrence[]): Conflict[] {
  const timed = occ.filter((o) => !o.all_day && !NON_BLOCKING.has(o.kind)).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const out: Conflict[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[j].start_at >= timed[i].end_at) break;
      const overlap = Math.min(Date.parse(timed[i].end_at), Date.parse(timed[j].end_at)) - Date.parse(timed[j].start_at);
      if (overlap > 0) out.push({ a: timed[i].occurrence_key, b: timed[j].occurrence_key, overlapMin: Math.round(overlap / 60000) });
    }
  }
  return out;
}

export interface Interval {
  start: number; // minutes after local midnight
  end: number;
}

/** Busy intervals on a local date (clipped to that day), merged. */
export function busyIntervals(occ: Occurrence[], date: string, tz: string): Interval[] {
  const dayStart = Date.parse(zonedToUtc(date, "00:00", tz));
  const dayEnd = Date.parse(zonedToUtc(addDays(date, 1), "00:00", tz));
  const ivs: Interval[] = [];
  for (const o of occ) {
    if (o.all_day || NON_BLOCKING.has(o.kind)) continue;
    const s = Math.max(Date.parse(o.start_at), dayStart);
    const e = Math.min(Date.parse(o.end_at), dayEnd);
    if (e <= s) continue;
    ivs.push({ start: Math.round((s - dayStart) / 60000), end: Math.round((e - dayStart) / 60000) });
  }
  return mergeIntervals(ivs);
}

export function mergeIntervals(ivs: Interval[]): Interval[] {
  const sorted = [...ivs].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

/** Free windows between busy intervals inside [windowStart, windowEnd] (minutes). */
export function freeSlots(busy: Interval[], windowStart: number, windowEnd: number, minLen = 15): Interval[] {
  const out: Interval[] = [];
  let cur = windowStart;
  for (const b of mergeIntervals(busy)) {
    if (b.end <= cur) continue;
    if (b.start >= windowEnd) break;
    if (b.start - cur >= minLen) out.push({ start: cur, end: Math.min(b.start, windowEnd) });
    cur = Math.max(cur, b.end);
  }
  if (windowEnd - cur >= minLen) out.push({ start: cur, end: windowEnd });
  return out;
}

export function sumMinutes(ivs: Interval[]): number {
  return ivs.reduce((s, i) => s + (i.end - i.start), 0);
}

export interface DayCapacity {
  windowMin: number; // waking window
  busyMin: number; // scheduled commitments inside the window
  freeMin: number; // unscheduled time left in the window
  /** Realistic focus capacity: free time minus a buffer for meals, transitions and rest. */
  usableMin: number;
  slots: Interval[];
}

/**
 * Capacity for a day. `nowMin` trims the past when planning today.
 * Planning to 100% of free time is the classic over-commitment trap, so only ~70% of
 * free time is treated as usable for planned work.
 */
export function dayCapacity(occ: Occurrence[], date: string, tz: string, dayStart: string, dayEnd: string, nowMin?: number): DayCapacity {
  let ws = timeToMinutes(dayStart);
  const we = Math.max(ws + 60, timeToMinutes(dayEnd));
  if (nowMin != null) ws = Math.max(ws, Math.min(we, nowMin));
  const busy = busyIntervals(occ, date, tz).map((b) => ({ start: Math.max(b.start, ws), end: Math.min(b.end, we) })).filter((b) => b.end > b.start);
  const slots = freeSlots(busy, ws, we);
  const freeMin = sumMinutes(slots);
  return {
    windowMin: Math.max(0, we - ws),
    busyMin: sumMinutes(busy),
    freeMin,
    usableMin: Math.round(freeMin * 0.7),
    slots,
  };
}
