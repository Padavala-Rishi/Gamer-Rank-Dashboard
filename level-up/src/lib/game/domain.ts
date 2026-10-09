import { addDays, diffDays, type YMD } from "../dates";

// ───────────── basketball ─────────────
export type PerfLog = { metric_id: string; logged_on: YMD; attempts: number | null; makes: number | null; value: number | null };
export type Metric = { id: string; name: string; kind: "shooting" | "value"; direction: "higher" | "lower"; unit: string | null };

export const MIN_ATTEMPTS_FOR_BEST = 20;

export type MetricSummary = {
  metric: Metric;
  entries: number;
  /** shooting: percentage per day (only days with enough attempts for a fair comparison) */
  series: { day: YMD; value: number; attempts?: number }[];
  best: { day: YMD; value: number; attempts?: number } | null;
  latest: { day: YMD; value: number; attempts?: number } | null;
  previous: { day: YMD; value: number } | null;
  totalAttempts: number;
  totalMakes: number;
};

export function summariseMetric(metric: Metric, logs: PerfLog[]): MetricSummary {
  const mine = logs.filter((l) => l.metric_id === metric.id);
  const byDay = new Map<YMD, { attempts: number; makes: number; value: number | null }>();
  for (const l of mine) {
    const d = byDay.get(l.logged_on) ?? { attempts: 0, makes: 0, value: null };
    d.attempts += l.attempts ?? 0;
    d.makes += l.makes ?? 0;
    if (l.value != null) d.value = metric.direction === "lower" ? Math.min(d.value ?? Infinity, l.value) : Math.max(d.value ?? -Infinity, l.value);
    byDay.set(l.logged_on, d);
  }
  const series: MetricSummary["series"] = [];
  for (const [day, d] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (metric.kind === "shooting") {
      if (d.attempts >= MIN_ATTEMPTS_FOR_BEST) series.push({ day, value: (d.makes / d.attempts) * 100, attempts: d.attempts });
    } else if (d.value != null) series.push({ day, value: d.value });
  }
  const better = (a: number, b: number) => (metric.direction === "lower" ? a < b : a > b);
  let best: MetricSummary["best"] = null;
  for (const p of series) if (!best || better(p.value, best.value)) best = p;
  return {
    metric, entries: mine.length, series, best,
    latest: series.length ? series[series.length - 1] : null,
    previous: series.length > 1 ? series[series.length - 2] : null,
    totalAttempts: mine.reduce((a, l) => a + (l.attempts ?? 0), 0),
    totalMakes: mine.reduce((a, l) => a + (l.makes ?? 0), 0),
  };
}

// ───────────── health ─────────────
export type SetRow = { exercise: string; reps: number; weight_kg: number; workout_date?: YMD };

/** Epley estimate. Returns the weight itself for a single. An estimate, not a tested max. */
export function est1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export type ExerciseRecord = { exercise: string; maxWeight: number; maxWeightReps: number; best1RM: number; bestVolumeSet: number; sets: number; lastDay: YMD | null };

export function personalRecords(sets: SetRow[]): ExerciseRecord[] {
  const by = new Map<string, ExerciseRecord>();
  for (const s of sets) {
    const key = s.exercise.trim().toLowerCase();
    const r = by.get(key) ?? { exercise: s.exercise.trim(), maxWeight: 0, maxWeightReps: 0, best1RM: 0, bestVolumeSet: 0, sets: 0, lastDay: null };
    r.sets++;
    if (s.weight_kg > r.maxWeight || (s.weight_kg === r.maxWeight && s.reps > r.maxWeightReps)) { r.maxWeight = s.weight_kg; r.maxWeightReps = s.reps; }
    r.best1RM = Math.max(r.best1RM, est1RM(s.weight_kg, s.reps));
    r.bestVolumeSet = Math.max(r.bestVolumeSet, s.weight_kg * s.reps);
    if (s.workout_date && (!r.lastDay || s.workout_date > r.lastDay)) r.lastDay = s.workout_date;
    by.set(key, r);
  }
  return [...by.values()].sort((a, b) => b.sets - a.sets);
}

/** Exercises where a set in `current` beats every earlier set (by estimated 1RM). */
export function newPersonalRecords(history: SetRow[], current: SetRow[]): string[] {
  const prior = new Map<string, number>();
  for (const s of history) { const k = s.exercise.trim().toLowerCase(); prior.set(k, Math.max(prior.get(k) ?? 0, est1RM(s.weight_kg, s.reps))); }
  const out = new Set<string>();
  for (const s of current) {
    const k = s.exercise.trim().toLowerCase();
    if (prior.has(k) && est1RM(s.weight_kg, s.reps) > prior.get(k)! + 0.01 && s.weight_kg > 0) out.add(s.exercise.trim());
  }
  return [...out];
}

export type WeightPoint = { day: YMD; value: number };
/** Linear trend over the last 28 days; null unless there are enough points across enough time. */
export function weightTrend(points: WeightPoint[], today: YMD): { perWeek: number; first: number; last: number; days: number } | null {
  const pts = points.filter((p) => diffDays(p.day, today) <= 28 && p.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (pts.length < 4) return null;
  const span = diffDays(pts[0].day, pts[pts.length - 1].day);
  if (span < 14) return null;
  const xs = pts.map((p) => diffDays(pts[0].day, p.day)), ys = pts.map((p) => p.value);
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (den === 0) return null;
  return { perWeek: (num / den) * 7, first: ys[0], last: ys[ys.length - 1], days: span };
}

/** A gentle guard against overtraining: it advises rest, it never rewards more. */
export function trainingLoadWarning(workoutDays: YMD[], restDays: YMD[], today: YMD): string | null {
  let run = 0;
  const w = new Set(workoutDays), r = new Set(restDays);
  for (let i = 0; i < 14; i++) { const d = addDays(today, -i); if (w.has(d) && !r.has(d)) run++; else break; }
  if (run >= 6) return `${run} training days in a row. Recovery is part of the plan: take a rest day.`;
  return null;
}

// ───────────── college ─────────────
export type SyllabusNode = { id: string; subject_id: string; parent_id: string | null; kind: string; title: string; status: "todo" | "learning" | "done"; sort_order: number; revision_count: number; next_revision_on: YMD | null; last_revised_on: YMD | null };

export const REVISION_INTERVALS = [1, 3, 7, 14, 30, 60];
export const nextRevisionDate = (from: YMD, revisionCount: number): YMD => addDays(from, REVISION_INTERVALS[Math.min(revisionCount, REVISION_INTERVALS.length - 1)]);

/** Leaf nodes carry the progress; a parent is complete when all its leaves are. */
export function syllabusProgress(nodes: SyllabusNode[]): { done: number; total: number; pct: number | null; revised: number } {
  const hasChild = new Set(nodes.map((n) => n.parent_id).filter(Boolean) as string[]);
  const leaves = nodes.filter((n) => !hasChild.has(n.id));
  const done = leaves.filter((n) => n.status === "done").length;
  const revised = leaves.filter((n) => n.status === "done" && n.revision_count > 0).length;
  return { done, total: leaves.length, pct: leaves.length ? done / leaves.length : null, revised };
}

export function revisionsDue(nodes: SyllabusNode[], today: YMD): SyllabusNode[] {
  return nodes.filter((n) => n.status === "done" && n.next_revision_on != null && n.next_revision_on <= today).sort((a, b) => (a.next_revision_on! < b.next_revision_on! ? -1 : 1));
}

export function daysUntil(date: YMD, today: YMD): number { return diffDays(today, date); }

// ───────────── development ─────────────
export type RoadmapItem = { track: string; status: "todo" | "doing" | "done" };
export function trackProgress(items: RoadmapItem[], track: string) {
  const mine = items.filter((i) => i.track === track);
  const done = mine.filter((i) => i.status === "done").length;
  return { done, total: mine.length, pct: mine.length ? done / mine.length : null };
}

export type LeadLite = { id: string; name: string; status: string; next_followup_on: YMD | null };
export function followUpsDue(leads: LeadLite[], today: YMD): LeadLite[] {
  return leads.filter((l) => !["won", "lost"].includes(l.status) && l.next_followup_on != null && l.next_followup_on <= today)
    .sort((a, b) => (a.next_followup_on! < b.next_followup_on! ? -1 : 1));
}
