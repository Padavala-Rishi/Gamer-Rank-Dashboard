// Financial projections. These are arithmetic estimates from the user's own numbers,
// not financial advice; the UI labels them as such.
import { addMonths, diffDays } from "./dates";

export interface Projection {
  current: number;
  target: number;
  gap: number;
  progress: number; // 0..1
  monthsToGoal: number | null; // at the current monthly contribution
  eta: string | null;
  requiredMonthly: number | null; // to hit the deadline
  onTrack: boolean | null;
}

export function projectGoal(target: number, current: number, monthly: number | null, deadline: string | null, today: string): Projection {
  const gap = Math.max(0, round2(target - current));
  const progress = target > 0 ? Math.max(0, Math.min(1, current / target)) : current >= target ? 1 : 0;
  let monthsToGoal: number | null = null;
  let eta: string | null = null;
  if (gap === 0) {
    monthsToGoal = 0;
    eta = today;
  } else if (monthly && monthly > 0) {
    monthsToGoal = Math.ceil(gap / monthly);
    eta = addMonths(today, monthsToGoal);
  }
  let requiredMonthly: number | null = null;
  let onTrack: boolean | null = null;
  if (deadline) {
    const monthsLeft = Math.max(0, diffDays(today, deadline) / 30.4375);
    requiredMonthly = gap === 0 ? 0 : monthsLeft < 1 ? gap : round2(gap / monthsLeft);
    onTrack = gap === 0 ? true : eta != null ? eta <= deadline : false;
  }
  return { current: round2(current), target, gap, progress, monthsToGoal, eta, requiredMonthly, onTrack };
}

export function monthlyEquivalent(amount: number, cycle: string): number {
  if (cycle === "weekly") return round2((amount * 52) / 12);
  if (cycle === "yearly") return round2(amount / 12);
  return amount;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number, currency = "INR", compact = false): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: compact || Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2,
      notation: compact && Math.abs(n) >= 100000 ? "compact" : "standard",
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
