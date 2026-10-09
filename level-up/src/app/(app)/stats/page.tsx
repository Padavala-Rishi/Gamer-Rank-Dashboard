import Link from "next/link";
import { ChartFrame, SimpleBars, StackedBars } from "@/components/charts";
import { domainSeries } from "@/lib/chart-config";
import { Icon } from "@/components/icon";
import { Money, Notice, ProgressBar, Section, Stat } from "@/components/ui";
import { CATEGORIES, CATEGORY_KEYS, CHART_ORDER, type CategoryKey } from "@/lib/constants";
import { addDays, eachDay, isoWeekday, weekStart, type YMD } from "@/lib/dates";
import { buildInsights, completionRate, funnel, incomeSummary, sumXpByCategory, timeByDomain, xpSeries, type XpRow } from "@/lib/game/analytics";
import { consistency, weeklyStreak } from "@/lib/game/streaks";
import { getContext, getProgress } from "@/lib/server/context";
import { getActiveDates, getRestDates, getXpRows } from "@/lib/server/queries";
import type { FocusSession, HealthDay, IncomeRecord, Lead, OutreachEntry, PracticeSession, Workout } from "@/lib/types";

export const metadata = { title: "Stats" };
const RANGES = [7, 30, 90] as const;

export default async function Stats({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await getContext();
  const { supabase, today, settings } = ctx;
  const sp = await searchParams;
  const range = (RANGES.find((r) => String(r) === sp.range) ?? 30) as 7 | 30 | 90;
  const from = addDays(today, -(range - 1));
  const from90 = addDays(today, -89);

  const [progress, xpAll, activeDates, restDates, tasks, focus, practice, workouts, days, money, leads, outreach, habitRows] = await Promise.all([
    getProgress(), getXpRows(ctx, "2000-01-01", today), getActiveDates(ctx, "2000-01-01"), getRestDates(ctx, "2000-01-01"),
    supabase.from("tasks").select("status,scheduled_date").gte("scheduled_date", from).lte("scheduled_date", today).neq("status", "template").then((r) => (r.data ?? []) as { status: string; scheduled_date: YMD }[]),
    supabase.from("focus_sessions").select("category,session_date,minutes").gte("session_date", from90).then((r) => (r.data ?? []) as Pick<FocusSession, "category" | "session_date" | "minutes">[]),
    supabase.from("practice_sessions").select("session_date,duration_min,status").gte("session_date", from90).then((r) => (r.data ?? []) as Pick<PracticeSession, "session_date" | "duration_min" | "status">[]),
    supabase.from("workouts").select("workout_date,duration_min").gte("workout_date", from90).then((r) => (r.data ?? []) as Pick<Workout, "workout_date" | "duration_min">[]),
    supabase.from("health_days").select("day,mobility_min").gte("day", from90).then((r) => (r.data ?? []) as Pick<HealthDay, "day" | "mobility_min">[]),
    supabase.from("income_records").select("*").then((r) => (r.data ?? []) as IncomeRecord[]),
    supabase.from("freelance_leads").select("status").then((r) => (r.data ?? []) as Pick<Lead, "status">[]),
    supabase.from("outreach_log").select("kind,occurred_on").gte("occurred_on", from).then((r) => (r.data ?? []) as Pick<OutreachEntry, "kind" | "occurred_on">[]),
    supabase.from("tasks").select("title,status,scheduled_date,template_id").not("template_id", "is", null).gte("scheduled_date", from).lte("scheduled_date", today).then((r) => (r.data ?? []) as { title: string; status: string; scheduled_date: YMD; template_id: string }[]),
  ]);

  const rows: XpRow[] = xpAll.filter((r) => r.day >= from);
  const totals = sumXpByCategory(rows, from, today);
  const totalXp = CATEGORY_KEYS.reduce((a, k) => a + totals[k], 0) + totals.life;
  const series = xpSeries(rows, from, today);
  // 90-day view is bucketed by week so bars stay readable
  const chartData = range === 90
    ? Object.values(series.reduce<Record<string, Record<string, number | string>>>((acc, p) => {
        const w = weekStart(p.day, settings.week_starts_on);
        acc[w] ??= { day: w, college: 0, basketball: 0, dev: 0, health: 0, life: 0 };
        for (const k of [...CHART_ORDER, "life"] as const) acc[w][k] = Number(acc[w][k]) + p[k];
        return acc;
      }, {}))
    : (series.map((p) => ({ ...p })) as Record<string, number | string>[]);
  const xpSeriesDefs = [...domainSeries(), { key: "life", label: "Life", color: "var(--c-life)" }];

  const rate = completionRate(tasks, from, today, today);
  const kept = consistency({ activeDates, restDates, restWeekdays: settings.rest_weekdays, today, days: range });
  const wk = weeklyStreak({ activeDates, restDates, today, weekStartsOn: settings.week_starts_on, minDays: 4 });
  const mins = timeByDomain({ focus, practice, workouts, mobility: days }, from, today);
  const activeInRange = new Set(activeDates.filter((d) => d >= from && d <= today)).size;

  // weekly consistency trend: kept days per week, last 12 weeks
  const weeks = Array.from({ length: range === 7 ? 4 : 12 }, (_, i) => addDays(weekStart(today, settings.week_starts_on), -7 * ((range === 7 ? 3 : 11) - i)));
  const activeSet = new Set(activeDates), restSet = new Set(restDates);
  const weeklyKept = weeks.map((w) => ({ day: w, days: eachDay(w, addDays(w, 6)).filter((d) => d <= today && (activeSet.has(d) || restSet.has(d) || settings.rest_weekdays.includes(isoWeekday(d)))).length }));

  // honest insights
  const lastDay: Partial<Record<CategoryKey, YMD>> = {};
  const net = new Map<string, number>();
  for (const r of xpAll) net.set(`${r.day}|${r.category}`, (net.get(`${r.day}|${r.category}`) ?? 0) + r.xp);
  for (const r of xpAll) if (r.category !== "life" && (net.get(`${r.day}|${r.category}`) ?? 0) > 0) { const k = r.category as CategoryKey; if (!lastDay[k] || r.day > lastDay[k]!) lastDay[k] = r.day; }
  const wsNow = weekStart(today, settings.week_starts_on);
  const wMin = timeByDomain({ focus, practice, workouts, mobility: days }, wsNow, today);
  const insights = buildInsights({
    today, xpRows: xpAll.filter((r) => r.day >= addDays(today, -27)), activeDates, restDates, lastActivity: lastDay,
    weekMinutes: wMin, weeklyTargets: { college: settings.targets.study_weekly_min, dev: settings.targets.coding_weekly_min },
  });

  const f = funnel(leads);
  const sent = outreach.filter((o) => ["message", "followup", "proposal"].includes(o.kind)).length;
  const income = incomeSummary(money.map((m) => ({ ...m, amount: Number(m.amount) })), from, today);
  const incomeCur = income.find((i) => i.currency === settings.currency);
  const wkTarget = settings.targets.workouts_weekly;
  const wkWorkouts = weeks.map((w) => ({ day: w, workouts: workouts.filter((x) => x.workout_date >= w && x.workout_date <= addDays(w, 6)).length }));

  const habits = new Map<string, { done: number; open: number }>();
  for (const h of habitRows) {
    const e = habits.get(h.title) ?? { done: 0, open: 0 };
    if (h.status === "done") e.done++; else if (h.status === "open" && h.scheduled_date < today) e.open++;
    habits.set(h.title, e);
  }

  const hours = (m: number) => `${Math.round(m / 6) / 10} h`;
  const hasAny = totalXp > 0 || rate.planned > 0;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold sm:text-3xl">Stats</h1><p className="mt-1 text-sm text-muted">What you actually did. Recorded values are labelled; estimates are flagged.</p></div>
        <nav className="flex gap-1" aria-label="Range">{RANGES.map((r) => <Link key={r} href={`/stats?range=${r}`} className="chip" data-active={r === range} aria-current={r === range ? "true" : undefined}>{r} days</Link>)}</nav>
      </header>

      <Section title="Insights" hint="Only shown when there's enough recorded history to say something real.">
        <ul className="space-y-2" data-testid="insights">
          {insights.map((i) => (
            <li key={i.id} className="card-inset flex items-start gap-3 px-3.5 py-3 text-sm">
              <Icon name={i.tone === "good" ? "trending-up" : i.tone === "warn" ? "alert-triangle" : "info"} size={16} className={`mt-0.5 shrink-0 ${i.tone === "good" ? "text-good" : i.tone === "warn" ? "text-warn" : "text-muted"}`} />
              <div className="min-w-0 flex-1">{i.text}{i.evidence && <span className="num ml-1 text-xs text-muted">({i.evidence})</span>}</div>
              <span className="badge shrink-0">{i.basis}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="XP earned" value={totalXp} sub={`last ${range} days`} />
        <Stat label="Completion rate" value={rate.rate == null ? "—" : `${Math.round(rate.rate * 100)}%`} sub={rate.planned ? `${rate.done} of ${rate.planned} planned quests` : "nothing planned in this range"} />
        <Stat label="Days kept" value={`${kept.kept}/${kept.days}`} sub={`${activeInRange} active · rest days count`} />
        <Stat label="Streak" value={<>{progress.current_streak}<span className="text-base font-medium text-muted"> d</span></>} sub={`longest ${progress.best_streak} d · ${wk.current} wk`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="XP earned" subtitle={range === 90 ? "Weekly totals, by area" : "Daily, by area"} legend={xpSeriesDefs.filter((s) => totals[s.key as keyof typeof totals] > 0)} empty={hasAny && totalXp > 0 ? null : "Complete quests to start earning XP."}
          table={{ columns: ["Day", ...xpSeriesDefs.map((s) => s.label)], rows: chartData.map((r) => [String(r.day), ...xpSeriesDefs.map((s) => Number(r[s.key] ?? 0))]) }}>
          <StackedBars data={chartData} series={xpSeriesDefs.filter((s) => totals[s.key as keyof typeof totals] > 0)} />
        </ChartFrame>
        <ChartFrame title="Time invested by area" subtitle="Minutes you logged: practice, focused study and coding, workouts and mobility" empty={Object.values(mins).some((m) => m > 0) ? null : "Log sessions, workouts or focus time to see where your hours go."}
          table={{ columns: ["Area", "Minutes"], rows: CHART_ORDER.map((k) => [CATEGORIES[k].name, mins[k]]) }}>
          <SimpleBars data={CHART_ORDER.map((k) => ({ area: CATEGORIES[k].short, minutes: mins[k] }))} xKey="area" dataKey="minutes" label="Minutes" unit=" min" />
        </ChartFrame>
        <ChartFrame title="Weekly consistency" subtitle="Days kept per week (a quest done, or a planned rest day)" empty={activeDates.length >= 3 ? null : "Appears after a few active days."} table={{ columns: ["Week of", "Days kept"], rows: weeklyKept.map((w) => [w.day, w.days]) }}>
          <SimpleBars data={weeklyKept} dataKey="days" label="Days kept" color="var(--accent)" target={4} />
        </ChartFrame>
        <ChartFrame title="Workouts per week" subtitle={wkTarget ? `Target ${wkTarget} per week` : "No weekly target set"} empty={wkWorkouts.some((w) => w.workouts) ? null : "Log workouts to see consistency."} table={{ columns: ["Week of", "Workouts"], rows: wkWorkouts.map((w) => [w.day, w.workouts]) }}>
          <SimpleBars data={wkWorkouts} dataKey="workouts" label="Workouts" color="var(--c-health)" target={wkTarget || undefined} />
        </ChartFrame>
      </div>

      <Section title={`Hours logged · ${range} days`} className="mt-6" hint="Recorded values.">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Basketball practice" value={hours(mins.basketball)} /><Stat label="Focused study" value={hours(mins.college)} /><Stat label="Coding & building" value={hours(mins.dev)} /><Stat label="Workouts & mobility" value={hours(mins.health)} />
        </div>
      </Section>

      <Section title="Freelance" hint="Outreach and outcomes. Income below is money you actually recorded.">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Outreach sent" value={sent} sub={`last ${range} days`} />
          <Stat label="Reply rate" value={f.replyRate == null ? "—" : `${Math.round(f.replyRate * 100)}%`} sub={f.replyRate == null ? "needs 5+ contacted" : `${f.replied} of ${f.contacted}`} />
          <Stat label="Clients won" value={f.won} sub={`${f.lost} lost`} />
          <Stat label="Income received" value={<Money amount={incomeCur?.received ?? 0} currency={settings.currency} />} sub="recorded payments" />
        </div>
      </Section>

      {habits.size > 0 && (
        <Section title="Habit completion" hint="Repeating quests. Skipped days aren't counted against you.">
          <ul className="space-y-2.5">{[...habits].map(([title, h]) => { const total = h.done + h.open; return <li key={title}><div className="mb-1 flex justify-between text-sm"><span>{title}</span><span className="num text-muted">{h.done}/{total}{total ? ` · ${Math.round((h.done / total) * 100)}%` : ""}</span></div><ProgressBar value={total ? h.done / total : 0} small label={`${title} completion`} /></li>; })}</ul>
        </Section>
      )}
      <Notice>Charts use only what you logged. Pace and trend figures elsewhere in the app are marked “estimate”. Bodyweight and strength trends are on the Health page.</Notice>
    </>
  );
}
