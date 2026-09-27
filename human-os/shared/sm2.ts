// SM-2 spaced repetition (the algorithm behind SuperMemo/Anki), lightly adapted.
import { addDays } from "./dates";

export interface CardState {
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
}

/** Grades shown to the user. */
export const GRADES = [
  { grade: 1, label: "Again", hint: "Forgot" },
  { grade: 3, label: "Hard", hint: "Recalled with effort" },
  { grade: 4, label: "Good", hint: "Recalled" },
  { grade: 5, label: "Easy", hint: "Instant" },
] as const;

export function review(card: CardState, grade: number, today: string): CardState & { due_date: string } {
  const g = Math.max(0, Math.min(5, Math.round(grade)));
  let { ease, interval_days, repetitions, lapses } = card;
  if (g < 3) {
    repetitions = 0;
    interval_days = 1;
    lapses += 1;
  } else {
    if (repetitions === 0) interval_days = 1;
    else if (repetitions === 1) interval_days = g === 5 ? 4 : 3;
    else interval_days = Math.round(interval_days * ease * (g === 3 ? 0.8 : g === 5 ? 1.15 : 1));
    repetitions += 1;
  }
  ease = Math.max(1.3, Math.round((ease + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02))) * 100) / 100);
  interval_days = Math.min(Math.max(1, interval_days), 3650);
  return { ease, interval_days, repetitions, lapses, due_date: addDays(today, interval_days) };
}
