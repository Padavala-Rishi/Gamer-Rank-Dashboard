// Task recurrence rules:
//   daily | weekdays | weekly:1,3,5 (0 = Sunday) | monthly:15 | every:3 (days)
import { addDays, addMonths, daysInMonth, weekday } from "./dates";

export function describeRecurrence(rule: string | null | undefined): string {
  if (!rule) return "";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (rule === "daily") return "Every day";
  if (rule === "weekdays") return "Every weekday";
  if (rule.startsWith("weekly:")) return `Weekly on ${rule.slice(7).split(",").map((d) => names[Number(d)]).join(", ")}`;
  if (rule.startsWith("monthly:")) return `Monthly on day ${rule.slice(8)}`;
  if (rule.startsWith("every:")) return `Every ${rule.slice(6)} days`;
  return rule;
}

/** First occurrence strictly after `from`. */
export function nextOccurrence(rule: string, from: string): string {
  if (rule === "daily") return addDays(from, 1);
  if (rule === "weekdays") {
    let d = addDays(from, 1);
    while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
    return d;
  }
  if (rule.startsWith("weekly:")) {
    const days = new Set(rule.slice(7).split(",").map(Number));
    let d = addDays(from, 1);
    for (let i = 0; i < 7 && !days.has(weekday(d)); i++) d = addDays(d, 1);
    return d;
  }
  if (rule.startsWith("monthly:")) {
    const dom = Number(rule.slice(8));
    const clamp = (ym: string) => {
      const [y, m] = ym.split("-").map(Number);
      return `${ym}-${String(Math.min(dom, daysInMonth(y, m - 1))).padStart(2, "0")}`;
    };
    const thisMonth = clamp(from.slice(0, 7));
    if (thisMonth > from) return thisMonth;
    return clamp(addMonths(from.slice(0, 7) + "-01", 1).slice(0, 7));
  }
  if (rule.startsWith("every:")) return addDays(from, Math.max(1, Number(rule.slice(6))));
  throw new Error(`Unknown recurrence rule: ${rule}`);
}

/**
 * Due date of the next instance after completing a recurring task.
 * Completing early keeps the cadence; completing late never schedules into the past.
 */
export function nextDueAfterCompletion(rule: string, dueDate: string | null, today: string): string {
  let next = nextOccurrence(rule, dueDate ?? today);
  let guard = 0;
  while (next <= today && guard++ < 3700) next = nextOccurrence(rule, next);
  return next;
}
