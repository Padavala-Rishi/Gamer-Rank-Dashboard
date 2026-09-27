// Lightweight natural-language parsing for quick capture:
//   "Call mom tomorrow 6pm !high" → { title: "Call mom", date: <tomorrow>, time: "18:00", priority: "high" }
import { addDays, isValidDate, weekday } from "./dates";
import type { Priority } from "./constants";

export interface ParsedCapture {
  title: string;
  date: string | null;
  time: string | null;
  priority: Priority | null;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const PRIORITY_TOKENS: Record<string, Priority> = {
  "!critical": "critical", "!urgent": "critical", "!1": "critical", p1: "critical",
  "!high": "high", "!2": "high", p2: "high",
  "!medium": "medium", "!3": "medium", p3: "medium",
  "!low": "low", "!4": "low", p4: "low",
};

export function parseCapture(input: string, today: string): ParsedCapture {
  let text = ` ${input.trim()} `;
  let date: string | null = null;
  let time: string | null = null;
  let priority: Priority | null = null;

  text = text.replace(/\s(!critical|!urgent|!high|!medium|!low|![1-4]|p[1-4])(?=\s)/gi, (_m, tok: string) => {
    priority = PRIORITY_TOKENS[tok.toLowerCase()] ?? priority;
    return " ";
  });

  text = text.replace(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (_m, h: string, mi: string | undefined, ap: string) => {
    let hour = Number(h) % 12;
    if (ap.toLowerCase() === "pm") hour += 12;
    if (Number(h) <= 12) time = `${String(hour).padStart(2, "0")}:${mi ?? "00"}`;
    return " ";
  });
  if (!time) {
    text = text.replace(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (_m, h: string, mi: string) => {
      time = `${h.padStart(2, "0")}:${mi}`;
      return " ";
    });
  }

  const rules: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [/\s(today|tonight)(?=\s)/i, () => today],
    [/\s(tomorrow|tmrw)(?=\s)/i, () => addDays(today, 1)],
    [/\sin\s(\d{1,3})\s(days?|weeks?)(?=\s)/i, (m) => addDays(today, Number(m[1]) * (m[2].toLowerCase().startsWith("week") ? 7 : 1))],
    [/\snext\sweek(?=\s)/i, () => addDays(today, 7)],
    [/\s(?:on\s)?(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => (isValidDate(m[1]) ? m[1] : null)],
    [
      /\s(?:on\s|next\s)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?(?=\s)/i,
      (m) => {
        const idx = WEEKDAYS.findIndex((d) => d.startsWith(m[1].toLowerCase().slice(0, 3)));
        if (idx < 0) return null;
        let d = addDays(today, 1);
        while (weekday(d) !== idx) d = addDays(d, 1);
        return d;
      },
    ],
  ];
  for (const [re, fn] of rules) {
    const m = text.match(re);
    if (m) {
      const d = fn(m);
      if (d) {
        date = d;
        text = text.replace(re, " ");
        break;
      }
    }
  }
  const title = text.replace(/\s+/g, " ").trim() || input.trim();
  return { title: title.slice(0, 300), date, time, priority };
}
