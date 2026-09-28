// Life Audit: combines the user's self-assessment with signals measured in the app.
// Every finding records its source so the UI can distinguish:
//   "you said"   — the user's own ratings/answers
//   "your data"  — measured from what was logged in the app
//   "interpretation" — a rule-based reading, which can be wrong
import type { Ctx } from "./repo";
import { list } from "./repo";
import { R } from "./resources";
import { addDays } from "../shared/dates";
import { AUDIT_AREAS, label } from "../shared/constants";
import { dailySeries, summarize } from "./analytics";
import { accountBalances, goalsWithProgress, habitsWithStats, peopleToContact } from "./services";
import { round2 } from "../shared/finance";

export type Source = "you_said" | "your_data" | "interpretation";
export interface Finding {
  text: string;
  source: Source;
  area?: string;
}

export interface AuditRating {
  score: number; // 1..10
  note?: string | null;
}

export function auditSnapshot(ctx: Ctx) {
  const from = addDays(ctx.today, -29);
  const s = summarize(dailySeries(ctx, from, ctx.today));
  const goals = goalsWithProgress(ctx).filter((g) => g.status === "active");
  const habits = habitsWithStats(ctx, 30);
  const q1 = (sql: string, ...p: unknown[]) => ctx.db.prepare(sql).get(ctx.userId, ...p) as Record<string, number>;
  const areas = list(ctx, R.life_areas, { filters: { archived: false } });
  const values = list(ctx, R.personal_values);
  const linkedValues = q1("SELECT COUNT(DISTINCT gv.value_id) AS n FROM goal_values gv JOIN goals g ON g.id = gv.goal_id WHERE g.user_id = ? AND g.status = 'active'").n;
  const vision = ctx.db.prepare("SELECT identity, ideal_life, what_matters FROM visions WHERE user_id = ?").get(ctx.userId) as Record<string, string | null> | undefined;
  const envAvg = q1("SELECT AVG(rating) AS a FROM environment_checks WHERE user_id = ? AND checked_on >= ?", addDays(ctx.today, -90)).a;
  const money = q1(
    "SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS income, COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) AS expenses FROM transactions WHERE user_id = ? AND occurred_on >= ?",
    from,
  );
  const emergency = ctx.db.prepare("SELECT target_amount, current_amount, account_id FROM financial_goals WHERE user_id = ? AND kind = 'emergency' LIMIT 1").get(ctx.userId) as
    | { target_amount: number; current_amount: number | null; account_id: string | null }
    | undefined;
  const interactions = q1("SELECT COUNT(*) AS n FROM interactions WHERE user_id = ? AND occurred_on >= ?", from).n;
  const overdue = q1("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status IN ('todo','doing') AND due_date < ?", ctx.today).n;
  const openTasks = q1("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status IN ('todo','doing')").n;
  const skillsGap = q1("SELECT COUNT(*) AS n FROM skills WHERE user_id = ? AND current_level < target_level").n;
  const skillPractice = q1("SELECT COALESCE(SUM(minutes),0) AS m FROM skill_evidence WHERE user_id = ? AND occurred_on >= ?", from).m;
  const topicsMastered = q1("SELECT COUNT(*) AS n FROM topics WHERE user_id = ? AND mastery >= 3").n;
  const areaActivity = ctx.db
    .prepare(
      `SELECT la.id, la.name, la.focus,
        (SELECT COUNT(*) FROM goals g WHERE g.life_area_id = la.id AND g.status = 'active') AS goals,
        (SELECT COUNT(*) FROM tasks t LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN goals g ON g.id = COALESCE(t.goal_id, p.goal_id)
           WHERE t.user_id = la.user_id AND t.completed_at >= ? AND COALESCE(t.life_area_id, p.life_area_id, g.life_area_id) = la.id) AS tasks_done,
        (SELECT COUNT(*) FROM focus_sessions fs LEFT JOIN subjects s ON s.id = fs.subject_id LEFT JOIN goals g ON g.id = COALESCE(fs.goal_id, s.goal_id)
           WHERE fs.user_id = la.user_id AND fs.status = 'completed' AND fs.local_date >= ? AND COALESCE(s.life_area_id, g.life_area_id) = la.id) AS sessions,
        (SELECT COUNT(*) FROM habits h WHERE h.life_area_id = la.id AND h.archived = 0) AS habits
       FROM life_areas la WHERE la.user_id = ? AND la.archived = 0`,
    )
    .all(from + "T00:00:00.000Z", from, ctx.userId) as { id: string; name: string; focus: string; goals: number; tasks_done: number; sessions: number; habits: number }[];
  const emergencyBalance = emergency?.account_id ? (accountBalances(ctx).get(emergency.account_id)?.balance ?? 0) : (emergency?.current_amount ?? 0);

  return {
    period: { from, to: ctx.today },
    summary: s,
    active_goals: goals.length,
    focus_goals: goals.filter((g) => g.is_focus).map((g) => ({ title: g.title, pace: g.pace, progress: g.progress, last_activity: g.last_activity })),
    goals_behind: goals.filter((g) => g.pace === "behind" || g.pace === "overdue").map((g) => g.title),
    goals_without_actions: goals.filter((g) => g.tasks_total === 0 && g.habit_count === 0 && g.project_count === 0 && g.child_ids.length === 0).map((g) => g.title),
    habits: habits.map((h) => ({ title: h.title, consistency: h.stats.consistency30, streak: h.stats.currentStreak })),
    values: values.map((v) => v.name),
    values_linked: linkedValues,
    vision_written: !!(vision?.identity || vision?.ideal_life || vision?.what_matters),
    environment_avg: envAvg == null ? null : round2(envAvg),
    income_30d: round2(money.income),
    expenses_30d: round2(money.expenses),
    emergency_fund: emergency ? { target: emergency.target_amount, current: emergencyBalance } : null,
    interactions_30d: interactions,
    people_overdue: peopleToContact(ctx).length,
    overdue_tasks: overdue,
    open_tasks: openTasks,
    skills_with_gap: skillsGap,
    skill_practice_min_30d: skillPractice,
    topics_confident: topicsMastered,
    areas: areaActivity,
    life_area_count: areas.length,
  };
}

type Snapshot = ReturnType<typeof auditSnapshot>;

export function analyzeAudit(ratings: Record<string, AuditRating>, snap: Snapshot) {
  const s = snap.summary;
  const current: Finding[] = [];
  const strengths: Finding[] = [];
  const bottlenecks: Finding[] = [];
  const neglected: Finding[] = [];
  const contradictions: Finding[] = [];
  const opportunities: Finding[] = [];
  const actions: { text: string; link?: string; area?: string }[] = [];
  const name = (k: string) => label(AUDIT_AREAS, k);

  // Current state: what the user said, next to what the data shows.
  for (const [k] of AUDIT_AREAS) {
    const r = ratings[k];
    if (r) current.push({ text: `${name(k)}: you rated ${r.score}/10${r.note ? ` — “${r.note}”` : ""}`, source: "you_said", area: k });
  }
  if (s.checkin_days) current.push({ text: `Over the last 30 days: average sleep ${s.sleep_avg ?? "—"}h, mood ${s.mood_avg ?? "—"}/5, stress ${s.stress_avg ?? "—"}/5 (from ${s.checkin_days} check-ins).`, source: "your_data", area: "health" });
  current.push({ text: `${Math.round(s.focus_min / 60)}h of completed focus sessions, ${s.tasks_done} tasks completed (${s.important_done} important), ${s.exercise_days} exercise days.`, source: "your_data", area: "time" });
  if (snap.overdue_tasks) current.push({ text: `${snap.overdue_tasks} overdue tasks out of ${snap.open_tasks} open.`, source: "your_data", area: "time" });

  // Strengths
  for (const [k] of AUDIT_AREAS) if ((ratings[k]?.score ?? 0) >= 8) strengths.push({ text: `${name(k)} feels strong to you (${ratings[k].score}/10).`, source: "you_said", area: k });
  if (s.habit_rate != null && s.habit_rate >= 0.75) strengths.push({ text: `Habit consistency is ${Math.round(s.habit_rate * 100)}% over 30 days.`, source: "your_data", area: "growth" });
  if (s.exercise_days >= 12) strengths.push({ text: `You exercised on ${s.exercise_days} of the last 30 days.`, source: "your_data", area: "health" });
  if (s.sleep_avg != null && s.sleep_avg >= 7) strengths.push({ text: `Sleep averages ${s.sleep_avg}h.`, source: "your_data", area: "health" });
  if (snap.interactions_30d >= 8) strengths.push({ text: `${snap.interactions_30d} logged interactions with people you care about this month.`, source: "your_data", area: "relationships" });
  for (const h of snap.habits.filter((h) => (h.streak ?? 0) >= 14)) strengths.push({ text: `“${h.title}” has a ${h.streak}-day streak.`, source: "your_data", area: "growth" });

  // Bottlenecks
  if (s.sleep_avg != null && s.sleep_avg < 6.5) {
    bottlenecks.push({ text: `Sleep averages ${s.sleep_avg}h — low sleep tends to limit focus, mood and willpower.`, source: "interpretation", area: "health" });
    actions.push({ text: "Pick a fixed wind-down time for the next 7 nights and log sleep each morning.", link: "/health", area: "health" });
  }
  if (s.stress_avg != null && s.stress_avg >= 3.8) {
    bottlenecks.push({ text: `Stress averages ${s.stress_avg}/5. If this persists or feels unmanageable, talking to a professional is a strong move, not a weak one.`, source: "interpretation", area: "mind" });
    actions.push({ text: "Do the 5-question mental check-in on the three most stressful days this week.", link: "/journal?new=checkin", area: "mind" });
  }
  if (s.distractions >= 20) {
    bottlenecks.push({ text: `${s.distractions} distractions logged in 30 days.`, source: "your_data", area: "time" });
    actions.push({ text: "Review your distraction pattern and change one environmental trigger (e.g. phone in another room during focus).", link: "/focus", area: "environment" });
  }
  if (snap.overdue_tasks >= 10) {
    bottlenecks.push({ text: `${snap.overdue_tasks} overdue tasks create background noise and guilt.`, source: "interpretation", area: "time" });
    actions.push({ text: "Spend 20 minutes triaging overdue tasks: reschedule, delegate or delete each one.", link: "/tasks?view=overdue", area: "time" });
  }
  if (snap.active_goals > 8) bottlenecks.push({ text: `${snap.active_goals} active goals compete for the same limited time. Focus usually beats breadth.`, source: "interpretation", area: "purpose" });
  for (const t of snap.goals_without_actions.slice(0, 3)) {
    bottlenecks.push({ text: `Goal “${t}” has no projects, tasks or habits — nothing connects it to daily action.`, source: "your_data", area: "purpose" });
    actions.push({ text: `Break “${t}” down: define one milestone and one next task.`, link: "/goals", area: "purpose" });
  }

  // Neglected areas
  for (const a of snap.areas) {
    if (a.goals === 0 && a.tasks_done === 0 && a.sessions === 0 && a.habits === 0) neglected.push({ text: `${a.name}: no goals, habits or completed tasks in 30 days.`, source: "your_data" });
  }
  for (const [k] of AUDIT_AREAS) {
    const r = ratings[k];
    if (r && r.score <= 4) neglected.push({ text: `${name(k)} rated ${r.score}/10 — it may deserve deliberate attention.`, source: "you_said", area: k });
  }
  if (snap.people_overdue > 0) {
    neglected.push({ text: `${snap.people_overdue} people are past the contact rhythm you set.`, source: "your_data", area: "relationships" });
    actions.push({ text: "Reach out to the two people you've gone longest without contacting.", link: "/people", area: "relationships" });
  }

  // Contradictions between stated priorities and behaviour
  for (const a of snap.areas) {
    if (a.focus === "attention" && a.tasks_done === 0 && a.sessions === 0) contradictions.push({ text: `You marked ${a.name} as needing attention, but no tasks or focus sessions in that area were completed this month.`, source: "interpretation" });
  }
  for (const g of snap.focus_goals) {
    if (!g.last_activity || g.last_activity < snap.period.from) {
      contradictions.push({ text: `“${g.title}” is a focus goal, but nothing linked to it was completed in 30 days.`, source: "interpretation", area: "purpose" });
      actions.push({ text: `Schedule two focus blocks this week for “${g.title}”.`, link: "/calendar", area: "purpose" });
    }
  }
  if (snap.values.length && snap.values_linked === 0) contradictions.push({ text: "You've defined values, but none of your active goals is linked to them.", source: "your_data", area: "purpose" });
  if ((ratings.health?.score ?? 0) >= 7 && s.sleep_avg != null && s.sleep_avg < 6.5) contradictions.push({ text: `You rated health ${ratings.health.score}/10, while sleep averages ${s.sleep_avg}h.`, source: "interpretation", area: "health" });
  if ((ratings.finance?.score ?? 10) <= 5 && snap.income_30d === 0 && snap.expenses_30d === 0) contradictions.push({ text: "Finance feels weak, but nothing is being tracked yet — visibility is the first step.", source: "interpretation", area: "finance" });

  // Opportunities
  if (!snap.vision_written) opportunities.push({ text: "Write your life vision. Goals without a 'why' are easy to abandon.", source: "interpretation", area: "purpose" });
  if (snap.habits.some((h) => h.consistency != null && h.consistency < 0.5)) opportunities.push({ text: "Some habits are below 50% consistency. Shrink their minimum version until it's almost too easy.", source: "interpretation", area: "growth" });
  if (snap.emergency_fund && snap.emergency_fund.current < snap.emergency_fund.target) opportunities.push({ text: `Emergency fund is ${Math.round((snap.emergency_fund.current / Math.max(1, snap.emergency_fund.target)) * 100)}% funded. Automating a small monthly transfer compounds.`, source: "interpretation", area: "finance" });
  if (snap.skills_with_gap > 0 && snap.skill_practice_min_30d < 120) opportunities.push({ text: `${snap.skills_with_gap} skills are below target, with ${snap.skill_practice_min_30d} minutes of logged practice this month.`, source: "your_data", area: "career" });
  if (snap.environment_avg != null && snap.environment_avg < 3) opportunities.push({ text: `Your environment ratings average ${snap.environment_avg}/5 — environment changes often beat willpower.`, source: "your_data", area: "environment" });
  const lowest = Object.entries(ratings).sort((a, b) => a[1].score - b[1].score)[0];
  if (lowest && lowest[1].score <= 6) actions.push({ text: `Choose one small, concrete action for ${name(lowest[0])} (your lowest-rated area) and schedule it.`, area: lowest[0] });
  if (!actions.length) actions.push({ text: "Things look balanced. Pick your top focus goal and protect three deep-work blocks for it this week.", link: "/calendar" });

  return { current, strengths, bottlenecks, neglected, contradictions, opportunities, next_actions: actions.slice(0, 7) };
}
