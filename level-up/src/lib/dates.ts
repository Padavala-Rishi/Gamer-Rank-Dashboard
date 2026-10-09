// Calendar-date helpers. A "day" is a plain 'YYYY-MM-DD' string in the USER's time zone; arithmetic is done in
// UTC on those strings, so daylight-saving changes can never shift a date.

export type YMD = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isYMD(s: unknown): s is YMD {
  if (typeof s !== "string" || !RE.test(s)) return false;
  const d = toDate(s);
  return fromDate(d) === s;
}

export function toDate(s: YMD): Date {
  const m = RE.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export function fromDate(d: Date): YMD {
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Today's date in the given IANA time zone. */
export function todayIn(tz: string, now: Date = new Date()): YMD {
  return localDateOf(now, tz);
}

/** The calendar date a moment falls on for someone in `tz`. */
export function localDateOf(ts: string | Date, tz: string): YMD {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(s: YMD, n: number): YMD {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: YMD, b: YMD): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(s: YMD): number {
  const w = toDate(s).getUTCDay();
  return w === 0 ? 7 : w;
}

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const weekdayKey = (s: YMD) => WEEKDAY_KEYS[isoWeekday(s) - 1];

/** First day of the week containing `s` (Monday by default, or Sunday when startsOn = 0). */
export function weekStart(s: YMD, startsOn: 0 | 1 = 1): YMD {
  const iso = isoWeekday(s); // 1..7
  const back = startsOn === 1 ? iso - 1 : iso % 7;
  return addDays(s, -back);
}

export function startOfMonth(s: YMD): YMD {
  return `${s.slice(0, 7)}-01`;
}
export function daysInMonth(s: YMD): number {
  const [y, m] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function endOfMonth(s: YMD): YMD {
  return `${s.slice(0, 7)}-${String(daysInMonth(s)).padStart(2, "0")}`;
}
export function addMonths(s: YMD, n: number): YMD {
  const [y, m] = s.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-01`;
}

/** Inclusive list of days. */
export function eachDay(from: YMD, to: YMD): YMD[] {
  const out: YMD[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function lastNDays(n: number, today: YMD): YMD[] {
  return eachDay(addDays(today, -(n - 1)), today);
}

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type DayFormat = { weekday?: "short" | "long"; day?: "numeric"; month?: "short" | "long"; year?: "numeric" };

/**
 * Format a calendar day, e.g. "Fri 9 Oct". Built from fixed tables rather than Intl: Node and browsers disagree on
 * punctuation ("Sun 25 Oct" vs "Sun, 25 Oct"), which breaks hydration for any client component that shows a date.
 */
export function formatDay(s: YMD, f: DayFormat = { weekday: "short", day: "numeric", month: "short" }): string {
  const d = toDate(s);
  const wd = f.weekday ? WEEKDAYS_LONG[d.getUTCDay()] : null;
  const month = f.month ? MONTHS_LONG[d.getUTCMonth()] : null;
  const dm = [f.day ? String(d.getUTCDate()) : null, f.month === "short" ? month!.slice(0, 3) : month, f.year ? String(d.getUTCFullYear()) : null].filter(Boolean).join(" ");
  const head = wd ? (f.weekday === "short" ? wd.slice(0, 3) : wd) : null;
  return [head, dm].filter(Boolean).join(f.weekday === "long" && dm ? ", " : " ");
}

/** "October 2026" */
export function formatMonth(s: YMD): string {
  const d = toDate(s);
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Friendly relative label: Today / Tomorrow / Yesterday / weekday / date. */
export function relativeDay(s: YMD, today: YMD): string {
  const d = diffDays(today, s);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d < 7) return formatDay(s, { weekday: "long" });
  return formatDay(s);
}

/** Format a stored timestamp in the user's own time zone, e.g. "9 Oct, 02:18". Deterministic across Node and browsers. */
export function formatTimestamp(ts: string | Date, tz: string): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${Number(get("day"))} ${MONTHS_LONG[Number(get("month")) - 1].slice(0, 3)}, ${get("hour").padStart(2, "0")}:${get("minute").padStart(2, "0")}`;
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** "HH:MM[:SS]" → minutes after midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
