// Analytics over a date range. Each metric exists to support a decision; the "insights"
// are correlations in the user's own data, phrased as patterns — never as causes.
import type { Ctx } from "./repo";
import { addDays, diffDays, eachDay, startOfWeek } from "../shared/dates";
import { habitStats, isScheduled } from "../shared/habits";
import { getProfile } from "./profile";
import { list } from "./repo";
import { R } from "./resources";
import { goalsWithProgress } from "./services";
import { round2 } from "../shared/finance";

type Row = Record<string, unknown>;
type Series = Record<string, (number | null)[]>;

function byDate(ctx: Ctx, sql: string, from: string, to: string): Map<string, number> {
  const rows = ctx.db.prepare(sql).all(ctx.userId, from, to) as { d: string; v: number }[];
  return new Map(rows.map((r) => [r.d, r.v]));
}

export interface DailySeries {
  dates: string[];
  series: Series;
}

export function dailySeries(ctx: Ctx, from: string, to: string): DailySeries {
  const dates = eachDay(from, to);
  // completed_at is a UTC instant; bucket by the user's local date.
  const doneRows = ctx.db
    .prepare("SELECT completed_at, priority FROM tasks WHERE user_id = ? AND status='done' AND completed_at >= ? AND completed_at <= ?")
    .all(ctx.userId, addDays(from, -1) + "T00:00:00.000Z", addDays(to, 1) + "T23:59:59.999Z") as { completed_at: string; priority: string }[];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const localDone = new Map<string, number>();
  const localImportant = new Map<string, number>();
  for (const r of doneRows) {
    const d = fmt.format(new Date(r.completed_at));
    localDone.set(d, (localDone.get(d) ?? 0) + 1);
    if (r.priority === "critical" || r.priority === "high") localImportant.set(d, (localImportant.get(d) ?? 0) + 1);
  }
  const focus = byDate(ctx, "SELECT local_date AS d, SUM(actual_min) AS v FROM focus_sessions WHERE user_id = ? AND status='completed' AND local_date BETWEEN ? AND ? GROUP BY d", from, to);
  const study = byDate(ctx, "SELECT local_date AS d, SUM(actual_min) AS v FROM focus_sessions WHERE user_id = ? AND status='completed' AND (kind='study' OR subject_id IS NOT NULL) AND local_date BETWEEN ? AND ? GROUP BY d", from, to);
  const exercise = byDate(ctx, "SELECT occurred_on AS d, SUM(duration_min) AS v FROM workouts WHERE user_id = ? AND occurred_on BETWEEN ? AND ? GROUP BY d", from, to);
  const distractions = byDate(ctx, "SELECT local_date AS d, COUNT(*) AS v FROM distractions WHERE user_id = ? AND local_date BETWEEN ? AND ? GROUP BY d", from, to);
  const checkins = new Map(
    (ctx.db.prepare("SELECT * FROM checkins WHERE user_id = ? AND entry_date BETWEEN ? AND ?").all(ctx.userId, from, to) as Row[]).map((r) => [r.entry_date as string, r]),
  );

  // Habit completion rate per day across daily/specific-day habits.
  const habits = list(ctx, R.habits, { filters: { archived: false } }).filter((h) => h.frequency !== "weekly");
  const logs = ctx.db.prepare("SELECT habit_id, date, status FROM habit_logs WHERE user_id = ? AND date BETWEEN ? AND ?").all(ctx.userId, from, to) as { habit_id: string; date: string; status: string }[];
  const logMap = new Map(logs.map((l) => [`${l.habit_id}:${l.date}`, l.status]));

  const s: Series = { tasks_done: [], important_done: [], focus_min: [], study_min: [], exercise_min: [], habit_rate: [], sleep_hours: [], mood: [], energy: [], stress: [], screen_min: [], distractions: [] };
  for (const d of dates) {
    s.tasks_done.push(localDone.get(d) ?? 0);
    s.important_done.push(localImportant.get(d) ?? 0);
    s.focus_min.push(focus.get(d) ?? 0);
    s.study_min.push(study.get(d) ?? 0);
    s.exercise_min.push(exercise.get(d) ?? 0);
    s.distractions.push(distractions.get(d) ?? 0);
    const c = checkins.get(d);
    s.sleep_hours.push((c?.sleep_hours as number) ?? null);
    s.mood.push((c?.mood as number) ?? null);
    s.energy.push((c?.energy as number) ?? null);
    s.stress.push((c?.stress as number) ?? null);
    s.screen_min.push((c?.screen_min as number) ?? null);
    let scheduled = 0,
      ok = 0;
    for (const h of habits) {
      if (h.paused || (h.created_at as string).slice(0, 10) > d || !isScheduled(h as never, d)) continue;
      const st = logMap.get(`${h.id}:${d}`);
      if (st === "skipped") continue;
      if (d === ctx.today && !st) continue;
      scheduled++;
      if (st === "done" || st === "minimum") ok++;
    }
    s.habit_rate.push(scheduled ? ok / scheduled : null);
  }
  return { dates, series: s };
}

const sum = (a: (number | null)[]) => a.reduce<number>((x, y) => x + (y ?? 0), 0);
const avg = (a: (number | null)[]) => {
  const v = a.filter((x): x is number => x != null);
  return v.length ? round2(v.reduce((x, y) => x + y, 0) / v.length) : null;
};

export function summarize(ds: DailySeries) {
  const s = ds.series;
  return {
    tasks_done: sum(s.tasks_done),
    important_done: sum(s.important_done),
    focus_min: sum(s.focus_min),
    study_min: sum(s.study_min),
    exercise_min: sum(s.exercise_min),
    exercise_days: s.exercise_min.filter((x) => (x ?? 0) > 0).length,
    habit_rate: avg(s.habit_rate),
    sleep_avg: avg(s.sleep_hours),
    mood_avg: avg(s.mood),
    energy_avg: avg(s.energy),
    stress_avg: avg(s.stress),
    screen_avg: avg(s.screen_min),
    distractions: sum(s.distractions),
    checkin_days: s.mood.filter((x) => x != null).length,
  };
}

/** Compares a metric on days split by a condition; only reports with enough data on both sides. */
function split(ds: DailySeries, cond: (i: number) => boolean | null, metric: string) {
  const a: number[] = [],
    b: number[] = [];
  ds.dates.forEach((_d, i) => {
    const c = cond(i);
    const v = ds.series[metric][i];
    if (c == null || v == null) return;
    (c ? a : b).push(v);
  });
  if (a.length < 5 || b.length < 5) return null;
  const m = (x: number[]) => x.reduce((p, q) => p + q, 0) / x.length;
  return { yes: round2(m(a)), no: round2(m(b)), nYes: a.length, nNo: b.length };
}

export function patternInsights(ds: DailySeries): { text: string; decision: string }[] {
  const s = ds.series;
  const out: { text: string; decision: string }[] = [];
  const sleep7 = split(ds, (i) => (s.sleep_hours[i] == null ? null : (s.sleep_hours[i] as number) >= 7), "focus_min");
  if (sleep7 && Math.abs(sleep7.yes - sleep7.no) >= 15) {
    out.push({
      text: `On days after 7h+ sleep you averaged ${Math.round(sleep7.yes)} focus minutes, vs ${Math.round(sleep7.no)} otherwise (${sleep7.nYes} vs ${sleep7.nNo} days).`,
      decision: sleep7.yes > sleep7.no ? "Protecting sleep may be one of your highest-leverage productivity moves." : "Sleep doesn't appear to limit your focus right now — look elsewhere for bottlenecks.",
    });
  }
  const ex = split(ds, (i) => (s.mood[i] == null ? null : (s.exercise_min[i] ?? 0) > 0), "mood");
  if (ex && Math.abs(ex.yes - ex.no) >= 0.3) {
    out.push({
      text: `Your mood averaged ${ex.yes}/5 on days you exercised vs ${ex.no}/5 on days you didn't.`,
      decision: ex.yes > ex.no ? "Consider exercise as a mood tool, not only a fitness one." : "Exercise days don't show better mood in your data — intensity or timing might matter.",
    });
  }
  const scr = split(ds, (i) => (s.screen_min[i] == null ? null : (s.screen_min[i] as number) >= 240), "focus_min");
  if (scr && Math.abs(scr.yes - scr.no) >= 15) {
    out.push({
      text: `High screen-time days (4h+) averaged ${Math.round(scr.yes)} focus minutes vs ${Math.round(scr.no)} on lower days.`,
      decision: scr.yes < scr.no ? "Reducing recreational screen time could free focus capacity." : "Screen time doesn't seem to crowd out your focus.",
    });
  }
  const st = split(ds, (i) => (s.stress[i] == null ? null : (s.stress[i] as number) >= 4), "habit_rate");
  if (st && Math.abs(st.yes - st.no) >= 0.15) {
    out.push({
      text: `On high-stress days your habit completion was ${Math.round(st.yes * 100)}% vs ${Math.round(st.no * 100)}% on calmer days.`,
      decision: "Define smaller minimum versions for stressful days so habits survive them.",
    });
  }
  return out;
}

export function analytics(ctx: Ctx, rangeDays: number) {
  const to = ctx.today;
  const from = addDays(to, -(rangeDays - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(rangeDays - 1));
  const cur = dailySeries(ctx, from, to);
  const prev = dailySeries(ctx, prevFrom, prevTo);
  const profile = getProfile(ctx.db, ctx.userId);

  // Weekly buckets for long ranges keep charts readable.
  let chart: DailySeries = cur;
  if (rangeDays > 90) {
    const weeks = new Map<string, number[]>();
    cur.dates.forEach((d, i) => {
      const w = startOfWeek(d, profile.week_start);
      weeks.set(w, [...(weeks.get(w) ?? []), i]);
    });
    const dates = [...weeks.keys()];
    const series: Series = {};
    for (const [k, arr] of Object.entries(cur.series)) {
      const additive = ["tasks_done", "important_done", "focus_min", "study_min", "exercise_min", "distractions"].includes(k);
      series[k] = dates.map((w) => {
        const vals = weeks.get(w)!.map((i) => arr[i]);
        return additive ? sum(vals) : avg(vals);
      });
    }
    chart = { dates, series };
  }

  // Time allocation: completed focus minutes by life area (via goal/task/subject).
  const alloc = ctx.db
    .prepare(
      `SELECT COALESCE(la.name, 'Unassigned') AS area, COALESCE(la.color, '#9ca3af') AS color, SUM(fs.actual_min) AS minutes
       FROM focus_sessions fs
       LEFT JOIN tasks t ON t.id = fs.task_id
       LEFT JOIN goals g ON g.id = COALESCE(fs.goal_id, t.goal_id)
       LEFT JOIN subjects s ON s.id = fs.subject_id
       LEFT JOIN life_areas la ON la.id = COALESCE(t.life_area_id, g.life_area_id, s.life_area_id)
       WHERE fs.user_id = ? AND fs.status = 'completed' AND fs.local_date BETWEEN ? AND ?
       GROUP BY 1, 2 ORDER BY minutes DESC`,
    )
    .all(ctx.userId, from, to) as { area: string; color: string; minutes: number }[];

  const eventRows = ctx.db
    .prepare("SELECT kind, start_at, end_at, recurrence FROM calendar_events WHERE user_id = ? AND recurrence = 'none' AND start_at >= ? AND start_at <= ?")
    .all(ctx.userId, from + "T00:00:00.000Z", to + "T23:59:59.999Z") as { kind: string; start_at: string; end_at: string }[];
  const byKind: Record<string, number> = {};
  for (const e of eventRows) byKind[e.kind] = (byKind[e.kind] ?? 0) + Math.round((Date.parse(e.end_at) - Date.parse(e.start_at)) / 60000);

  const goals = goalsWithProgress(ctx)
    .filter((g) => g.status === "active")
    .map((g) => ({ id: g.id, title: g.title, progress: g.progress, pace: g.pace, expected: g.expected, deadline: g.deadline, is_focus: g.is_focus }));

  const habits = list(ctx, R.habits, { filters: { archived: false } });
  const hlogs = ctx.db.prepare("SELECT habit_id, date, status FROM habit_logs WHERE user_id = ? AND date >= ?").all(ctx.userId, addDays(to, -400)) as { habit_id: string; date: string; status: string }[];
  const habitRows = habits.map((h) => {
    const st = habitStats(h as never, hlogs.filter((l) => l.habit_id === h.id), ctx.today, profile.week_start);
    return { id: h.id, title: h.title, consistency: st.consistency30, streak: st.currentStreak, unit: st.streakUnit, minimum: st.minimum30, done: st.done30 };
  });

  const projectsDone = ctx.db.prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND completed_at >= ?").get(ctx.userId, from) as { n: number };
  const openOverdue = ctx.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status IN ('todo','doing') AND due_date < ?").get(ctx.userId, ctx.today) as { n: number };
  const created = ctx.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND created_at >= ?").get(ctx.userId, from) as { n: number };

  const finance = ctx.db
    .prepare("SELECT substr(occurred_on,1,7) AS m, COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS income, COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) AS expenses FROM transactions WHERE user_id = ? AND occurred_on BETWEEN ? AND ? GROUP BY m ORDER BY m")
    .all(ctx.userId, from, to);

  return {
    range: { from, to, days: rangeDays, bucket: rangeDays > 90 ? "week" : "day" },
    chart,
    summary: summarize(cur),
    previous: summarize(prev),
    insights: patternInsights(cur),
    allocation: alloc,
    calendar_by_kind: byKind,
    goals,
    habits: habitRows,
    projects_completed: projectsDone.n,
    tasks_created: created.n,
    overdue_open: openOverdue.n,
    finance,
  };
}

export function reviewStats(ctx: Ctx, from: string, to: string) {
  const ds = dailySeries(ctx, from, to);
  const summary = summarize(ds);
  const q = <T = Row>(sql: string, ...p: unknown[]) => ctx.db.prepare(sql).all(ctx.userId, ...p) as T[];
  const fromIso = from + "T00:00:00.000Z";
  const toIso = addDays(to, 1) + "T23:59:59.999Z";
  const wins = {
    important_tasks: q("SELECT id, title, priority, completed_at FROM tasks WHERE user_id = ? AND status='done' AND priority IN ('critical','high') AND completed_at BETWEEN ? AND ? ORDER BY completed_at DESC LIMIT 20", fromIso, toIso),
    milestones: q("SELECT m.id, m.title, g.title AS goal FROM milestones m JOIN goals g ON g.id = m.goal_id WHERE m.user_id = ? AND m.completed_at BETWEEN ? AND ?", fromIso, toIso),
    goals_achieved: q("SELECT id, title FROM goals WHERE user_id = ? AND achieved_at BETWEEN ? AND ?", fromIso, toIso),
    projects_completed: q("SELECT id, title FROM projects WHERE user_id = ? AND completed_at BETWEEN ? AND ?", fromIso, toIso),
  };
  const slipped = {
    overdue_tasks: q("SELECT id, title, due_date, priority FROM tasks WHERE user_id = ? AND status IN ('todo','doing') AND due_date BETWEEN ? AND ? ORDER BY due_date", from, to),
    missed_milestones: q("SELECT m.id, m.title, m.due_date, g.title AS goal FROM milestones m JOIN goals g ON g.id = m.goal_id WHERE m.user_id = ? AND m.completed_at IS NULL AND m.due_date BETWEEN ? AND ?", from, to),
  };
  const topDistraction = ctx.db
    .prepare("SELECT kind, COUNT(*) AS n FROM distractions WHERE user_id = ? AND local_date BETWEEN ? AND ? GROUP BY kind ORDER BY n DESC LIMIT 1")
    .get(ctx.userId, from, to) as { kind: string; n: number } | undefined;
  const stalledProjects = q(
    "SELECT p.id, p.title FROM projects p WHERE p.user_id = ? AND p.status = 'active' AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.status IN ('todo','doing'))",
  );
  const blocked = q("SELECT DISTINCT t.id, t.title FROM tasks t JOIN task_dependencies d ON d.task_id = t.id JOIN tasks b ON b.id = d.depends_on_id WHERE t.user_id = ? AND t.status IN ('todo','doing') AND b.status NOT IN ('done','cancelled') LIMIT 20");
  const goals = goalsWithProgress(ctx).filter((g) => g.status === "active");
  const idleFocusGoals = goals.filter((g) => g.is_focus && (!g.last_activity || (g.last_activity as string).slice(0, 10) < from));
  const bottlenecks: string[] = [];
  if (topDistraction && topDistraction.n >= 3) bottlenecks.push(`Most frequent distraction: ${topDistraction.kind} (${topDistraction.n}×)`);
  for (const p of stalledProjects.slice(0, 5)) bottlenecks.push(`Active project “${p.title}” has no next task`);
  if (blocked.length) bottlenecks.push(`${blocked.length} task${blocked.length === 1 ? " is" : "s are"} blocked by unfinished dependencies`);
  for (const g of idleFocusGoals.slice(0, 5)) bottlenecks.push(`Focus goal “${g.title}” had no completed tasks this period`);
  if (summary.sleep_avg != null && summary.sleep_avg < 6.5) bottlenecks.push(`Average sleep was ${summary.sleep_avg}h`);

  const interactions = ctx.db.prepare("SELECT COUNT(*) AS n FROM interactions WHERE user_id = ? AND occurred_on BETWEEN ? AND ?").get(ctx.userId, from, to) as { n: number };
  const journalCount = ctx.db.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ?").get(ctx.userId, from, to) as { n: number };
  const money = ctx.db
    .prepare("SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS income, COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) AS expenses FROM transactions WHERE user_id = ? AND occurred_on BETWEEN ? AND ?")
    .get(ctx.userId, from, to) as { income: number; expenses: number };
  const hlogs = ctx.db.prepare("SELECT habit_id, date, status FROM habit_logs WHERE user_id = ? AND date <= ?").all(ctx.userId, to) as { habit_id: string; date: string; status: string }[];
  const habits = list(ctx, R.habits, { filters: { archived: false } }).map((h) => {
    const days = eachDay(from, to > ctx.today ? ctx.today : to).filter((d) => isScheduled(h as never, d) && d >= (h.created_at as string).slice(0, 10));
    const logs = hlogs.filter((l) => l.habit_id === h.id && l.date >= from && l.date <= to);
    const ok = logs.filter((l) => l.status === "done" || l.status === "minimum").length;
    const skipped = logs.filter((l) => l.status === "skipped").length;
    const target = h.frequency === "weekly" ? Math.ceil(((h.times_per_week as number) ?? 1) * (diffDays(from, to) + 1) / 7) : Math.max(0, days.length - skipped);
    return { id: h.id, title: h.title, completed: ok, target, rate: target ? Math.min(1, ok / target) : null };
  });
  const areaTime = analyticsAreaTime(ctx, from, to);
  return {
    period: { from, to },
    summary,
    wins,
    slipped,
    bottlenecks,
    goals: goals.map((g) => ({ id: g.id, title: g.title, progress: g.progress, pace: g.pace, horizon: g.horizon, is_focus: g.is_focus, life_area_id: g.life_area_id })),
    habits,
    relationships: { interactions: interactions.n },
    journal_entries: journalCount.n,
    finance: { income: round2(money.income), expenses: round2(money.expenses) },
    area_time: areaTime,
  };
}

function analyticsAreaTime(ctx: Ctx, from: string, to: string) {
  return ctx.db
    .prepare(
      `SELECT COALESCE(la.name, 'Unassigned') AS area, SUM(fs.actual_min) AS minutes
       FROM focus_sessions fs LEFT JOIN tasks t ON t.id = fs.task_id
       LEFT JOIN goals g ON g.id = COALESCE(fs.goal_id, t.goal_id)
       LEFT JOIN subjects s ON s.id = fs.subject_id
       LEFT JOIN life_areas la ON la.id = COALESCE(t.life_area_id, g.life_area_id, s.life_area_id)
       WHERE fs.user_id = ? AND fs.status='completed' AND fs.local_date BETWEEN ? AND ? GROUP BY area ORDER BY minutes DESC`,
    )
    .all(ctx.userId, from, to);
}
