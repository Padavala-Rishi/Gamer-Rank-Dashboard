// Timezone-aware date helpers with no dependencies.
//
// Conventions used across the app:
//  - A "date" is a calendar day in the user's timezone, stored as "YYYY-MM-DD".
//  - A "time" is a wall-clock time, stored as "HH:MM".
//  - An "instant" is an absolute point in time, stored as an ISO-8601 UTC string.
// Calendar-day arithmetic is done in UTC on the date string itself, so it is
// immune to DST transitions.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidTime(s: unknown): s is string {
  return typeof s === "string" && TIME_RE.test(s);
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toUtcDate(date: string): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

export function addMonths(date: string, months: number): string {
  const d = toUtcDate(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  d.setUTCDate(Math.min(day, last));
  return fromUtcDate(d);
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date: string): number {
  return toUtcDate(date).getUTCDay();
}

export function startOfWeek(date: string, weekStart = 1): string {
  const wd = weekday(date);
  const delta = (wd - weekStart + 7) % 7;
  return addDays(date, -delta);
}

export function startOfMonth(date: string): string {
  return date.slice(0, 8) + "01";
}

export function endOfMonth(date: string): string {
  const d = toUtcDate(date);
  return `${date.slice(0, 8)}${String(daysInMonth(d.getUTCFullYear(), d.getUTCMonth())).padStart(2, "0")}`;
}

export function startOfQuarter(date: string): string {
  const m = Number(date.slice(5, 7));
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${date.slice(0, 4)}-${String(qm).padStart(2, "0")}-01`;
}

export function endOfQuarter(date: string): string {
  return addDays(addMonths(startOfQuarter(date), 3), -1);
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const n = diffDays(start, end);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

// ---------------------------------------------------------------------------
// Timezone conversion

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

function zonedParts(instant: Date, tz: string): ZonedParts {
  const parts = formatter(tz).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of tz from UTC at the given instant, in minutes (e.g. +330 for Asia/Kolkata). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const actual = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - actual) / 60_000);
}

/** Calendar date for an instant, as seen in tz. */
export function dateInTz(instant: Date | string, tz: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const p = zonedParts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minutes after local midnight for an instant, as seen in tz. */
export function minutesInTz(instant: Date | string, tz: string): number {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const p = zonedParts(d, tz);
  return p.hour * 60 + p.minute;
}

export function todayIn(tz: string, now: Date = new Date()): string {
  return dateInTz(now, tz);
}

/** Converts a local wall-clock date+time in tz to a UTC instant (ISO string). */
export function zonedToUtc(date: string, time: string, tz: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes handle DST boundaries correctly for all real-world zones.
  let offset = tzOffsetMinutes(new Date(guess), tz);
  let ts = guess - offset * 60_000;
  const offset2 = tzOffsetMinutes(new Date(ts), tz);
  if (offset2 !== offset) {
    offset = offset2;
    ts = guess - offset * 60_000;
  }
  return new Date(ts).toISOString();
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Quarter label like "2026-Q3" */
export function quarterLabel(date: string): string {
  const q = Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1;
  return `${date.slice(0, 4)}-Q${q}`;
}
