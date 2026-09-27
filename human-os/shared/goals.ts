// Goal progress, pace and SMART-quality checks.
import { diffDays } from "./dates";

export interface GoalLike {
  id: string;
  status: string;
  progress_mode: string;
  metric_start: number | null;
  metric_current: number | null;
  metric_target: number | null;
  manual_progress: number | null;
  start_date: string | null;
  deadline: string | null;
  created_at: string;
  description?: string | null;
  why?: string | null;
  value_ids?: string[];
  title?: string;
}

export interface GoalInputs {
  milestonesDone: number;
  milestonesTotal: number;
  tasksDone: number;
  tasksTotal: number;
  /** Progress of child goals (0..1), used when a goal has no own measure. */
  childProgress: number[];
}

/** Returns 0..1, or null when the goal has no measurable progress yet. */
export function goalProgress(g: GoalLike, i: GoalInputs): number | null {
  if (g.status === "achieved") return 1;
  const childAvg = i.childProgress.length ? i.childProgress.reduce((a, b) => a + b, 0) / i.childProgress.length : null;
  switch (g.progress_mode) {
    case "metric": {
      const { metric_start: s, metric_current: c, metric_target: t } = g;
      if (t == null || c == null) return childAvg;
      const start = s ?? 0;
      if (t === start) return c === t ? 1 : 0;
      return clamp01((c - start) / (t - start));
    }
    case "tasks":
      return i.tasksTotal ? i.tasksDone / i.tasksTotal : childAvg;
    case "manual":
      return g.manual_progress != null ? clamp01(g.manual_progress / 100) : childAvg;
    case "milestones":
    default:
      return i.milestonesTotal ? i.milestonesDone / i.milestonesTotal : childAvg;
  }
}

export type Pace = "achieved" | "on_track" | "at_risk" | "behind" | "overdue" | "no_deadline" | "not_measured" | "inactive";

export const PACE_LABEL: Record<Pace, string> = {
  achieved: "Achieved",
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  overdue: "Past deadline",
  no_deadline: "No deadline",
  not_measured: "Not measured",
  inactive: "Inactive",
};

/**
 * Compares progress with the share of time elapsed. This is a heuristic — many goals are
 * non-linear — so the UI presents it as a prompt to look, not a verdict.
 */
export function goalPace(g: GoalLike, progress: number | null, today: string): { pace: Pace; expected: number | null } {
  if (g.status === "achieved") return { pace: "achieved", expected: null };
  if (g.status !== "active") return { pace: "inactive", expected: null };
  if (!g.deadline) return { pace: progress == null ? "not_measured" : "no_deadline", expected: null };
  if (today > g.deadline) return { pace: "overdue", expected: 1 };
  if (progress == null) return { pace: "not_measured", expected: null };
  const start = g.start_date ?? g.created_at.slice(0, 10);
  const total = Math.max(1, diffDays(start, g.deadline));
  const elapsed = Math.max(0, Math.min(total, diffDays(start, today)));
  const expected = elapsed / total;
  if (progress >= expected - 0.1) return { pace: "on_track", expected };
  if (progress >= expected - 0.25) return { pace: "at_risk", expected };
  return { pace: "behind", expected };
}

export interface SmartCheck {
  key: "specific" | "measurable" | "achievable" | "relevant" | "time_bound";
  label: string;
  ok: boolean | null; // null = only the user can judge
  hint: string;
}

export function smartCheck(g: GoalLike, milestonesTotal: number): SmartCheck[] {
  const measurable =
    (g.progress_mode === "metric" && g.metric_target != null) ||
    (g.progress_mode === "milestones" && milestonesTotal > 0) ||
    g.progress_mode === "tasks" ||
    (g.progress_mode === "manual" && g.manual_progress != null);
  return [
    {
      key: "specific",
      label: "Specific",
      ok: (g.description?.trim().length ?? 0) >= 20 || (g.title?.trim().split(/\s+/).length ?? 0) >= 4,
      hint: "Describe exactly what done looks like.",
    },
    { key: "measurable", label: "Measurable", ok: measurable, hint: "Add a metric target or milestones." },
    { key: "achievable", label: "Achievable", ok: null, hint: "Only you can judge this — is it realistic given your constraints?" },
    {
      key: "relevant",
      label: "Relevant",
      ok: (g.why?.trim().length ?? 0) > 0 || (g.value_ids?.length ?? 0) > 0,
      hint: "Write why it matters or link it to a value.",
    },
    { key: "time_bound", label: "Time-bound", ok: !!g.deadline, hint: "Set a deadline." },
  ];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
