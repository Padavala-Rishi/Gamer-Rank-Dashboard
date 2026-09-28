import { diffDays, formatDuration } from "../../shared/dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtDate(date: string | null | undefined, today?: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!date) return "";
  if (today) {
    const d = diffDays(today, date);
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    if (d === -1) return "Yesterday";
    if (d > 1 && d < 7) return DAYS[new Date(date + "T00:00:00Z").getUTCDay()];
  }
  const dt = new Date(date + "T00:00:00Z");
  const s = `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  const wd = opts.weekday ? `${DAYS[dt.getUTCDay()]} ` : "";
  const showYear = opts.year || (today && date.slice(0, 4) !== today.slice(0, 4));
  return `${wd}${s}${showYear ? ` ${dt.getUTCFullYear()}` : ""}`;
}

export function fmtLongDate(date: string): string {
  const dt = new Date(date + "T00:00:00Z");
  return dt.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function fmtTimeInTz(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz, hour12: false });
}

export function fmtDateTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz, hour12: false });
}

export const fmtMin = (m: number | null | undefined) => (m == null ? "—" : formatDuration(m));
export const pct = (x: number | null | undefined, digits = 0) => (x == null ? "—" : `${(x * 100).toFixed(digits)}%`);

export function dueClass(date: string | null | undefined, today: string): string {
  if (!date) return "";
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "";
}

export function relDays(date: string | null | undefined, today: string): string {
  if (!date) return "";
  const d = diffDays(today, date);
  if (d === 0) return "today";
  if (d > 0) return `in ${d} day${d === 1 ? "" : "s"}`;
  return `${-d} day${d === -1 ? "" : "s"} ago`;
}

export function greeting(minutes: number): string {
  if (minutes < 5 * 60) return "Good night";
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 17 * 60) return "Good afternoon";
  return "Good evening";
}

export function compact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: Math.abs(n) >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
