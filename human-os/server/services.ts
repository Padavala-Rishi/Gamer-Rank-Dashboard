// Read-model builders shared by several endpoints.
import type { Ctx } from "./repo";
import { list } from "./repo";
import { R } from "./resources";
import { goalPace, goalProgress, smartCheck, type GoalLike } from "../shared/goals";
import { habitStats, isScheduled, type HabitStats } from "../shared/habits";
import { addDays, diffDays, zonedToUtc } from "../shared/dates";
import { expandEvents, type EventLike, type Occurrence } from "../shared/calendar";
import type { PlanTask } from "../shared/planner";
import { getProfile } from "./profile";

type Row = Record<string, unknown>;

export interface GoalView extends Row {
  progress: number | null;
  pace: string;
  expected: number | null;
  milestones_done: number;
  milestones_total: number;
  tasks_done: number;
  tasks_total: number;
  habit_count: number;
  project_count: number;
  child_ids: string[];
  smart: ReturnType<typeof smartCheck>;
  days_left: number | null;
  last_activity: string | null;
}

export function goalsWithProgress(ctx: Ctx): GoalView[] {
  const goals = list(ctx, R.goals) as (Row & GoalLike)[];
  const q = (sql: string) => ctx.db.prepare(sql).all(ctx.userId) as Row[];
  const ms = new Map(q("SELECT goal_id, COUNT(*) AS total, SUM(completed_at IS NOT NULL) AS done FROM milestones WHERE user_id = ? GROUP BY goal_id").map((r) => [r.goal_id, r]));
  const ts = new Map(
    q(
      "SELECT COALESCE(t.goal_id, p.goal_id) AS goal_id, COUNT(*) AS total, SUM(t.status = 'done') AS done, MAX(t.completed_at) AS last FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.user_id = ? AND COALESCE(t.goal_id, p.goal_id) IS NOT NULL AND t.status <> 'cancelled' AND t.parent_id IS NULL GROUP BY 1",
    ).map((r) => [r.goal_id, r]),
  );
  const hs = new Map(q("SELECT goal_id, COUNT(*) AS n FROM habits WHERE user_id = ? AND goal_id IS NOT NULL AND archived = 0 GROUP BY goal_id").map((r) => [r.goal_id, r.n]));
  const ps = new Map(q("SELECT goal_id, COUNT(*) AS n FROM projects WHERE user_id = ? AND goal_id IS NOT NULL GROUP BY goal_id").map((r) => [r.goal_id, r.n]));
  const children = new Map<string, string[]>();
  for (const g of goals) if (g.parent_id) children.set(g.parent_id as string, [...(children.get(g.parent_id as string) ?? []), g.id]);

  const byId = new Map(goals.map((g) => [g.id, g]));
  const cache = new Map<string, number | null>();
  const visiting = new Set<string>();
  const progressOf = (id: string): number | null => {
    if (cache.has(id)) return cache.get(id)!;
    if (visiting.has(id)) return null;
    visiting.add(id);
    const g = byId.get(id)!;
    const m = ms.get(id);
    const t = ts.get(id);
    const kids = (children.get(id) ?? []).filter((c) => byId.get(c)?.status !== "dropped");
    const childProgress = kids.map(progressOf).filter((p): p is number => p != null);
    const p = goalProgress(g, {
      milestonesDone: Number(m?.done ?? 0),
      milestonesTotal: Number(m?.total ?? 0),
      tasksDone: Number(t?.done ?? 0),
      tasksTotal: Number(t?.total ?? 0),
      childProgress,
    });
    visiting.delete(id);
    cache.set(id, p);
    return p;
  };

  return goals.map((g) => {
    const progress = progressOf(g.id);
    const { pace, expected } = goalPace(g, progress, ctx.today);
    const m = ms.get(g.id);
    const t = ts.get(g.id);
    return {
      ...g,
      progress,
      pace,
      expected,
      milestones_done: Number(m?.done ?? 0),
      milestones_total: Number(m?.total ?? 0),
      tasks_done: Number(t?.done ?? 0),
      tasks_total: Number(t?.total ?? 0),
      habit_count: Number(hs.get(g.id) ?? 0),
      project_count: Number(ps.get(g.id) ?? 0),
      child_ids: children.get(g.id) ?? [],
      smart: smartCheck(g, Number(m?.total ?? 0)),
      days_left: g.deadline ? diffDays(ctx.today, g.deadline) : null,
      last_activity: (t?.last as string | undefined) ?? null,
    };
  });
}

export function planTasks(ctx: Ctx, goals?: GoalView[]): PlanTask[] {
  const gv = goals ?? goalsWithProgress(ctx);
  const goalMap = new Map(gv.map((g) => [g.id as string, g]));
  const tasks = list(ctx, R.tasks, { filters: { status: ["todo", "doing"] } }) as unknown as (PlanTask & Row)[];
  const projects = new Map(
    (ctx.db.prepare("SELECT id, title, deadline, status, goal_id FROM projects WHERE user_id = ?").all(ctx.userId) as Row[]).map((p) => [p.id, p]),
  );
  return tasks
    .filter((t) => {
      const p = t.project_id ? projects.get(t.project_id as string) : null;
      return !p || (p.status !== "on_hold" && p.status !== "archived");
    })
    .map((t) => {
      const p = t.project_id ? projects.get(t.project_id as string) : null;
      const goalId = (t.goal_id as string | null) ?? ((p?.goal_id as string | null) ?? null);
      const g = goalId ? goalMap.get(goalId) : undefined;
      const activeGoal = g && g.status === "active" ? g : undefined;
      return {
        ...t,
        goal_id: activeGoal ? goalId : null,
        goal_title: (activeGoal?.title as string) ?? null,
        goal_focus: Boolean(activeGoal?.is_focus),
        goal_pace: activeGoal?.pace ?? null,
        project_title: (p?.title as string) ?? null,
        project_deadline: (p?.deadline as string) ?? null,
      };
    });
}

export interface HabitView extends Row {
  stats: HabitStats;
  logs: { date: string; status: string; value: number | null; id: string }[];
}

export function habitsWithStats(ctx: Ctx, days = 120): HabitView[] {
  const profile = getProfile(ctx.db, ctx.userId);
  const habits = list(ctx, R.habits, { filters: { archived: false } });
  const since = addDays(ctx.today, -Math.max(days, 400));
  const logs = ctx.db
    .prepare("SELECT id, habit_id, date, status, value FROM habit_logs WHERE user_id = ? AND date >= ? ORDER BY date")
    .all(ctx.userId, since) as { id: string; habit_id: string; date: string; status: string; value: number | null }[];
  const byHabit = new Map<string, typeof logs>();
  for (const l of logs) byHabit.set(l.habit_id, [...(byHabit.get(l.habit_id) ?? []), l]);
  const displayFrom = addDays(ctx.today, -days);
  return habits.map((h) => {
    const hl = byHabit.get(h.id as string) ?? [];
    const stats = habitStats(h as never, hl, ctx.today, profile.week_start);
    return { ...h, stats, logs: hl.filter((l) => l.date >= displayFrom) };
  });
}

export function habitsDueToday(ctx: Ctx, habits?: HabitView[]) {
  return (habits ?? habitsWithStats(ctx, 30)).filter((h) => {
    if (h.paused) return false;
    if (h.stats.todayStatus) return false;
    if (h.frequency === "weekly") return (h.stats.weekProgress?.done ?? 0) < (h.stats.weekProgress?.target ?? 1);
    return isScheduled(h as never, ctx.today);
  });
}

export function occurrencesBetween(ctx: Ctx, from: string, to: string): Occurrence[] {
  // Fetch non-recurring events near the range plus all recurring events, then expand.
  const lo = zonedToUtc(addDays(from, -1), "00:00", ctx.tz);
  const hi = zonedToUtc(addDays(to, 2), "00:00", ctx.tz);
  const rows = ctx.db
    .prepare("SELECT * FROM calendar_events WHERE user_id = ? AND ((recurrence = 'none' AND end_at >= ? AND start_at <= ?) OR (recurrence <> 'none' AND start_at <= ?))")
    .all(ctx.userId, lo, hi, hi) as Row[];
  const events = rows.map((r) => ({ ...r, all_day: Boolean(r.all_day), is_demo: Boolean(r.is_demo), user_id: undefined })) as unknown as EventLike[];
  return expandEvents(events, from, to, ctx.tz);
}

export function checkinFor(ctx: Ctx, date: string): Row | null {
  const rows = list(ctx, R.checkins, { filters: { entry_date: date } });
  return rows[0] ?? null;
}

export function workoutMinutes(ctx: Ctx, from: string, to: string): number {
  const r = ctx.db.prepare("SELECT COALESCE(SUM(duration_min),0) AS m FROM workouts WHERE user_id = ? AND occurred_on BETWEEN ? AND ?").get(ctx.userId, from, to) as { m: number };
  return r.m;
}

export function flashcardsDue(ctx: Ctx): number {
  const r = ctx.db.prepare("SELECT COUNT(*) AS n FROM flashcards WHERE user_id = ? AND due_date <= ?").get(ctx.userId, ctx.today) as { n: number };
  return r.n;
}

export function peopleToContact(ctx: Ctx): { id: string; name: string; days: number; important: boolean }[] {
  const rows = list(ctx, R.people) as (Row & { last_interaction: string | null })[];
  return rows
    .filter((p) => p.contact_every_days)
    .map((p) => {
      const since = p.last_interaction ? diffDays(p.last_interaction, ctx.today) : diffDays((p.created_at as string).slice(0, 10), ctx.today);
      return { id: p.id as string, name: p.name as string, days: since, important: Boolean(p.important), cadence: p.contact_every_days as number };
    })
    .filter((p) => p.days >= p.cadence)
    .sort((a, b) => Number(b.important) - Number(a.important) || b.days / 1 - a.days / 1)
    .map(({ id, name, days, important }) => ({ id, name, days, important }));
}

export function upcomingBirthdays(ctx: Ctx, withinDays = 14): { id: string; name: string; date: string; inDays: number }[] {
  const rows = ctx.db.prepare("SELECT id, name, birthday FROM people WHERE user_id = ? AND birthday IS NOT NULL").all(ctx.userId) as { id: string; name: string; birthday: string }[];
  const out: { id: string; name: string; date: string; inDays: number }[] = [];
  const year = Number(ctx.today.slice(0, 4));
  for (const p of rows) {
    const md = p.birthday.startsWith("--") ? p.birthday.slice(2) : p.birthday.slice(5);
    for (const y of [year, year + 1]) {
      let date = `${y}-${md}`;
      if (md === "02-29" && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) date = `${y}-02-28`;
      const d = diffDays(ctx.today, date);
      if (d >= 0 && d <= withinDays) {
        out.push({ id: p.id, name: p.name, date, inDays: d });
        break;
      }
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

/** Current balance of every account: opening balance adjusted by its transactions. */
export function accountBalances(ctx: Ctx): Map<string, { balance: number; liability: boolean }> {
  const rows = ctx.db
    .prepare(
      `SELECT a.id, a.kind, a.opening_balance,
        COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id AND t.kind = 'income'),0)
        - COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id AND t.kind IN ('expense','transfer')),0)
        + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.to_account_id = a.id AND t.kind = 'transfer'),0) AS delta
       FROM financial_accounts a WHERE a.user_id = ?`,
    )
    .all(ctx.userId) as { id: string; kind: string; opening_balance: number; delta: number }[];
  // For liabilities the stored balance is what is owed, so spending on them increases the debt.
  return new Map(
    rows.map((r) => {
      const liability = r.kind === "credit" || r.kind === "loan";
      return [r.id, { balance: Math.round((r.opening_balance + (liability ? -r.delta : r.delta)) * 100) / 100, liability }];
    }),
  );
}
