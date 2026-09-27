// Deterministic planning engine.
//
// Every score comes with human-readable reasons so the user can see *why* something is
// suggested and disagree with it. Nothing here claims to know better than the user; it only
// combines what they told the app (priorities, deadlines, goals, energy, calendar).
import { PRIORITY_WEIGHT, type Energy, type Priority } from "./constants";
import { diffDays, formatDuration } from "./dates";

export interface PlanTask {
  id: string;
  title: string;
  status: string;
  priority: Priority;
  due_date: string | null;
  due_time: string | null;
  scheduled_date: string | null;
  mit_date: string | null;
  estimate_min: number | null;
  energy: Energy | null;
  context: string | null;
  first_step: string | null;
  blocked?: boolean;
  snoozed_until: string | null;
  project_title?: string | null;
  project_deadline?: string | null;
  goal_id: string | null;
  goal_title?: string | null;
  goal_focus?: boolean;
  goal_pace?: string | null;
  parent_id: string | null;
}

export interface ScoredTask {
  task: PlanTask;
  score: number;
  reasons: string[];
  estimate: number; // minutes (defaulted when unknown)
}

export const DEFAULT_ESTIMATE = 30;

export function energyFromScale(n: number | null | undefined): Energy | null {
  if (n == null) return null;
  return n <= 2 ? "low" : n >= 4 ? "high" : "medium";
}

export function scoreTask(t: PlanTask, today: string, opts: { energy?: Energy | null; availableMin?: number | null; nowIso?: string } = {}): ScoredTask | null {
  if (t.status === "done" || t.status === "cancelled") return null;
  if (t.blocked) return null;
  if (t.snoozed_until && opts.nowIso && t.snoozed_until > opts.nowIso) return null;
  if (t.scheduled_date && t.scheduled_date > today && !(t.due_date && t.due_date <= today)) return null; // deliberately deferred

  let score = 0;
  const reasons: string[] = [];
  const p = PRIORITY_WEIGHT[t.priority] ?? 2;
  score += [0, 0, 10, 25, 40][p];
  if (t.priority === "critical" || t.priority === "high") reasons.push(`${t.priority === "critical" ? "Critical" : "High"} priority`);

  if (t.due_date) {
    const d = diffDays(today, t.due_date);
    if (d < 0) {
      score += 35 + Math.min(10, -d);
      reasons.push(`Overdue by ${-d} day${d === -1 ? "" : "s"}`);
    } else if (d === 0) {
      score += 30;
      reasons.push(t.due_time ? `Due today at ${t.due_time}` : "Due today");
    } else if (d === 1) {
      score += 18;
      reasons.push("Due tomorrow");
    } else if (d <= 3) {
      score += 10;
      reasons.push(`Due in ${d} days`);
    } else if (d <= 7) {
      score += 5;
      reasons.push(`Due in ${d} days`);
    }
  }
  if (t.mit_date === today) {
    score += 30;
    reasons.push("You picked it as a most important task today");
  } else if (t.scheduled_date === today) {
    score += 15;
    reasons.push("Planned for today");
  }
  if (t.goal_id) {
    if (t.goal_focus) {
      score += 15;
      reasons.push(`Moves your focus goal “${t.goal_title ?? "goal"}” forward`);
    } else {
      score += 5;
      reasons.push(`Linked to goal “${t.goal_title ?? "goal"}”`);
    }
    if (t.goal_pace === "behind" || t.goal_pace === "at_risk") {
      score += 10;
      reasons.push(`That goal is ${t.goal_pace === "behind" ? "behind" : "at risk"}`);
    }
  }
  if (t.project_deadline) {
    const d = diffDays(today, t.project_deadline);
    if (d >= 0 && d <= 7) {
      score += 5;
      reasons.push(`Project “${t.project_title}” is due in ${d} day${d === 1 ? "" : "s"}`);
    }
  }
  if (t.status === "doing") {
    score += 8;
    reasons.push("Already in progress");
  }

  const estimate = t.estimate_min ?? DEFAULT_ESTIMATE;
  if (opts.energy === "low" && t.energy === "high") {
    score -= 20;
    reasons.push("Needs high energy (yours is low right now)");
  } else if (opts.energy === "low" && t.energy === "low") score += 5;
  else if (opts.energy === "high" && t.energy === "high") score += 5;

  if (opts.availableMin != null) {
    if (estimate <= opts.availableMin) score += 5;
    else score -= 15;
  }
  return { task: t, score, reasons, estimate };
}

export function rankTasks(tasks: PlanTask[], today: string, opts: Parameters<typeof scoreTask>[2] = {}): ScoredTask[] {
  return tasks
    .filter((t) => !t.parent_id || t.status !== "done")
    .map((t) => scoreTask(t, today, opts))
    .filter((x): x is ScoredTask => !!x)
    .sort((a, b) => b.score - a.score || (a.task.due_date ?? "9999").localeCompare(b.task.due_date ?? "9999"));
}

// ---------------------------------------------------------------------------
// Daily plan

export interface PlanContext {
  today: string;
  energy: Energy | null;
  usableMin: number;
  freeMin: number;
  busyMin: number;
  hasFocusGoal: boolean;
  activeSubjects: { id: string; title: string }[];
  exercisedToday: boolean;
  restDay: boolean;
  stress: number | null;
  habitsDue: { id: string; title: string }[];
  peopleToContact: { id: string; name: string }[];
  flashcardsDue: number;
}

export interface PlanSuggestion {
  category: "deep_work" | "study" | "exercise" | "admin" | "relationships" | "development" | "recovery" | "free_time";
  title: string;
  detail: string;
  minutes: number | null;
  link?: string;
}

export interface DailyPlan {
  mits: ScoredTask[];
  fits: ScoredTask[];
  overflow: ScoredTask[];
  committedMin: number;
  usableMin: number;
  freeMin: number;
  busyMin: number;
  overloaded: boolean;
  warnings: string[];
  suggestions: PlanSuggestion[];
}

/**
 * Builds a realistic plan: at most 3 MITs, then as many other tasks as fit in ~70% of free time.
 * Everything else is explicitly listed as "won't fit today" instead of silently piling up.
 */
export function buildDailyPlan(ranked: ScoredTask[], ctx: PlanContext): DailyPlan {
  const warnings: string[] = [];
  const alreadyMits = ranked.filter((r) => r.task.mit_date === ctx.today);
  // The user's own picks come first; if fewer than three, add clearly urgent candidates.
  const extra = ranked.filter((r) => r.task.mit_date !== ctx.today && r.score >= (alreadyMits.length ? 45 : 25));
  const mits = [...alreadyMits, ...extra].slice(0, 3);
  if (alreadyMits.length > 3) warnings.push(`You've marked ${alreadyMits.length} tasks as most important. Three is the useful maximum — when everything is important, nothing is.`);

  let committed = mits.reduce((s, r) => s + r.estimate, 0);
  const fits: ScoredTask[] = [];
  const overflow: ScoredTask[] = [];
  const mitIds = new Set(mits.map((m) => m.task.id));
  for (const r of ranked) {
    if (mitIds.has(r.task.id)) continue;
    const relevant = r.task.scheduled_date === ctx.today || (r.task.due_date != null && r.task.due_date <= ctx.today) || r.score >= 20;
    if (!relevant) continue;
    if (committed + r.estimate <= ctx.usableMin) {
      fits.push(r);
      committed += r.estimate;
    } else overflow.push(r);
  }
  const overloaded = committed > ctx.usableMin || overflow.some((o) => o.task.due_date != null && o.task.due_date <= ctx.today);
  if (committed > ctx.usableMin) {
    warnings.push(
      `Your most important tasks need about ${formatDuration(committed)}, but you realistically have ${formatDuration(ctx.usableMin)} of focused time today. Consider shrinking the scope or moving one.`,
    );
  }
  const dueOverflow = overflow.filter((o) => o.task.due_date != null && o.task.due_date <= ctx.today);
  if (dueOverflow.length) {
    warnings.push(
      `${dueOverflow.length} task${dueOverflow.length === 1 ? " is" : "s are"} due today or overdue but won't fit. Decide now: renegotiate the deadline, delegate, or drop — rather than carrying it silently.`,
    );
  }
  if (ctx.busyMin > 0 && ctx.freeMin < 60) warnings.push("Your calendar leaves less than an hour free today. Protect it — avoid adding more.");

  const suggestions: PlanSuggestion[] = [];
  const topGoalTask = mits.find((m) => m.task.goal_focus);
  if (ctx.hasFocusGoal && ctx.freeMin >= 60) {
    suggestions.push({
      category: "deep_work",
      title: "Deep work block",
      detail: topGoalTask ? `Protect 60–90 min for “${topGoalTask.task.title}”.` : "Protect 60–90 min for your focus goal while your energy is best.",
      minutes: ctx.energy === "low" ? 45 : 90,
      link: "/focus",
    });
  }
  if (ctx.activeSubjects.length || ctx.flashcardsDue) {
    suggestions.push({
      category: "study",
      title: "Study",
      detail: [ctx.activeSubjects.length ? `Continue ${ctx.activeSubjects[0].title}` : null, ctx.flashcardsDue ? `${ctx.flashcardsDue} flashcards due` : null].filter(Boolean).join(" · "),
      minutes: ctx.flashcardsDue ? 15 + (ctx.activeSubjects.length ? 30 : 0) : 30,
      link: "/learning",
    });
  }
  if (!ctx.exercisedToday && !ctx.restDay) {
    suggestions.push({ category: "exercise", title: "Move your body", detail: "Even a 20-minute walk counts.", minutes: 30, link: "/health" });
  }
  if (ctx.peopleToContact.length) {
    suggestions.push({
      category: "relationships",
      title: "Reach out",
      detail: `It's been a while since you contacted ${ctx.peopleToContact.slice(0, 2).map((p) => p.name).join(" and ")}.`,
      minutes: 10,
      link: "/people",
    });
  }
  if (ctx.habitsDue.length) {
    suggestions.push({
      category: "development",
      title: "Habits",
      detail: `${ctx.habitsDue.length} due today: ${ctx.habitsDue.slice(0, 3).map((h) => h.title).join(", ")}${ctx.habitsDue.length > 3 ? "…" : ""}`,
      minutes: null,
      link: "/habits",
    });
  }
  const adminTasks = [...fits, ...mits].filter((r) => r.task.energy === "low" || (r.task.estimate_min ?? 30) <= 15).length;
  if (adminTasks >= 2) suggestions.push({ category: "admin", title: "Batch small tasks", detail: `Group your ${adminTasks} small tasks into one admin block.`, minutes: 30 });
  if (ctx.energy === "low" || (ctx.stress ?? 0) >= 4 || ctx.restDay) {
    suggestions.push({
      category: "recovery",
      title: "Recovery",
      detail: ctx.restDay ? "Rest day — recovery is part of performance." : "Energy is low or stress is high. Plan a real break; a lighter day is still a good day.",
      minutes: 30,
    });
  }
  suggestions.push({ category: "free_time", title: "Unplanned time", detail: "Leave some time unscheduled — it absorbs surprises.", minutes: Math.max(0, ctx.freeMin - ctx.usableMin) });

  return { mits, fits, overflow, committedMin: committed, usableMin: ctx.usableMin, freeMin: ctx.freeMin, busyMin: ctx.busyMin, overloaded, warnings, suggestions };
}

// ---------------------------------------------------------------------------
// "What should I do now?"

export interface NowContext {
  today: string;
  nowIso: string;
  availableMin: number;
  nextCommitment: { title: string; startsInMin: number } | null;
  energy: Energy | null;
  stress: number | null;
  runningSession: { id: string; objective: string | null; remainingMin: number } | null;
  checkinDone: boolean;
  isEvening: boolean;
  habitsDue: { id: string; title: string; minimum: string | null; streak: number }[];
  flashcardsDue: number;
  exercisedToday: boolean;
  restDay: boolean;
  personToContact: { id: string; name: string; days: number } | null;
  exclude: Set<string>;
}

export interface Recommendation {
  key: string; // e.g. task:<id>
  kind: "task" | "session" | "habit" | "flashcards" | "exercise" | "checkin" | "person" | "recovery" | "plan";
  title: string;
  action: string; // the concrete thing to do
  why: string[];
  minutes: number;
  expected: string;
  task_id?: string;
  habit_id?: string;
  person_id?: string;
  link?: string;
  score: number;
}

export function recommendNow(ranked: ScoredTask[], ctx: NowContext): { primary: Recommendation | null; alternatives: Recommendation[]; context: string } {
  const avail = Math.max(0, ctx.availableMin);
  const window = ctx.nextCommitment
    ? `You have ${formatDuration(avail)} before “${ctx.nextCommitment.title}”.`
    : `You have about ${formatDuration(avail)} of open time left today.`;

  if (ctx.runningSession) {
    const r: Recommendation = {
      key: `session:${ctx.runningSession.id}`,
      kind: "session",
      title: "Return to your focus session",
      action: ctx.runningSession.objective ?? "Continue your focus session",
      why: ["You already started this — finishing beats starting something new."],
      minutes: Math.max(1, ctx.runningSession.remainingMin),
      expected: "Session completed and reviewed.",
      link: "/focus",
      score: 1000,
    };
    return { primary: r, alternatives: [], context: window };
  }

  const cands: Recommendation[] = [];
  const buffer = avail > 20 ? 5 : 0;

  for (const r of ranked.slice(0, 12)) {
    const t = r.task;
    const fits = r.estimate <= avail - buffer;
    const minutes = Math.max(5, Math.min(r.estimate, avail - buffer));
    const partial = !fits;
    let action = t.title;
    let expected = partial ? `Meaningful progress on “${t.title}” (about ${formatDuration(minutes)} of ~${formatDuration(r.estimate)}).` : `“${t.title}” done.`;
    if (partial && avail - buffer < 15) {
      action = t.first_step ?? `Take the first small step on “${t.title}”`;
      expected = "Started — the hardest part is behind you.";
    }
    cands.push({
      key: `task:${t.id}`,
      kind: "task",
      title: t.title,
      action,
      why: r.reasons.length ? r.reasons : ["Next open task on your list"],
      minutes: partial && avail - buffer < 15 ? Math.max(2, Math.min(10, avail)) : minutes,
      expected,
      task_id: t.id,
      score: r.score + (partial ? -5 : 0),
    });
  }

  if (!ctx.checkinDone && !ctx.isEvening) {
    cands.push({ key: "checkin", kind: "checkin", title: "Morning check-in", action: "Log sleep, energy and mood (1 minute)", why: ["Your plan adapts to how you actually feel today."], minutes: 1, expected: "Today's plan calibrated to your energy.", link: "/health", score: 22 });
  }
  if ((ctx.energy === "low" && (ctx.stress ?? 0) >= 4) || (ctx.stress ?? 0) >= 5) {
    cands.push({ key: "recovery", kind: "recovery", title: "Take a real break", action: "Step away for 15 minutes — walk, stretch, or breathe. No phone.", why: ["Your check-in shows low energy and high stress.", "Recovery now protects the rest of your day."], minutes: 15, expected: "Lower stress; clearer head for the next task.", score: 45 });
  }
  for (const h of ctx.habitsDue.slice(0, 3)) {
    const evening = ctx.isEvening ? 15 : 0;
    cands.push({
      key: `habit:${h.id}`,
      kind: "habit",
      title: h.title,
      action: h.minimum ? `${h.title} — or at least the minimum: ${h.minimum}` : h.title,
      why: [h.streak > 1 ? `Keeps your ${h.streak}-day streak alive` : "Due today", ...(ctx.isEvening ? ["The day is ending — the minimum version still counts"] : [])],
      minutes: 15,
      expected: "Habit logged for today.",
      habit_id: h.id,
      link: "/habits",
      score: 18 + evening + Math.min(10, h.streak),
    });
  }
  if (ctx.flashcardsDue > 0) {
    cands.push({ key: "flashcards", kind: "flashcards", title: "Review flashcards", action: `Review ${ctx.flashcardsDue} due card${ctx.flashcardsDue === 1 ? "" : "s"}`, why: ["Reviewing at the right time is what makes spaced repetition work."], minutes: Math.min(20, Math.max(5, Math.ceil(ctx.flashcardsDue * 0.5))), expected: "Due cards cleared; memory strengthened.", link: "/learning/review", score: 14 + Math.min(10, ctx.flashcardsDue / 3) });
  }
  if (!ctx.exercisedToday && !ctx.restDay && avail >= 25) {
    cands.push({ key: "exercise", kind: "exercise", title: "Move", action: "A 20–30 minute workout or brisk walk", why: ["No exercise logged today."], minutes: 30, expected: "Exercise logged; energy boost.", link: "/health", score: 12 });
  }
  if (ctx.personToContact && avail >= 10) {
    cands.push({ key: `person:${ctx.personToContact.id}`, kind: "person", title: `Reach out to ${ctx.personToContact.name}`, action: `Send ${ctx.personToContact.name} a message or give them a call`, why: [`${ctx.personToContact.days} days since you last connected.`], minutes: 10, expected: "Relationship tended to.", person_id: ctx.personToContact.id, link: "/people", score: 10 });
  }
  if (!cands.some((c) => c.kind === "task")) {
    cands.push({ key: "plan", kind: "plan", title: "Plan your next steps", action: "Capture or pick the next concrete task for your top goal", why: ["You have no open tasks ready to work on."], minutes: 10, expected: "A clear next action.", link: "/today?plan=1", score: 5 });
  }

  const pool = cands.filter((c) => !ctx.exclude.has(c.key)).sort((a, b) => b.score - a.score);
  // Short windows favour short actions.
  if (avail < 15) pool.sort((a, b) => (a.minutes <= avail ? 0 : 1) - (b.minutes <= avail ? 0 : 1) || b.score - a.score);
  return { primary: pool[0] ?? null, alternatives: pool.slice(1, 4), context: window };
}
