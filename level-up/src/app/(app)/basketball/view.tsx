import { AchievementList } from "@/components/achievement-list";
import { ChartFrame, Lines, SimpleBars } from "@/components/charts";
import { SERIES_COLORS, type Series } from "@/lib/chart-config";
import { DomainHeader, SubTabs } from "@/components/domain-header";
import { Icon } from "@/components/icon";
import { QuestItem } from "@/components/quest-item";
import { ResourceButton } from "@/components/resource-form";
import { EmptyState, Notice, ProgressBar, Section, Stat } from "@/components/ui";
import { SKILL_LABEL, SKILLS, WEEKDAY_LABELS, type Skill } from "@/lib/constants";
import { addDays, eachDay, formatDay, formatMinutes, isoWeekday, weekStart } from "@/lib/dates";
import { sumXpByCategory } from "@/lib/game/analytics";
import { visibleNow } from "@/lib/game/planner";
import { summariseMetric } from "@/lib/game/domain";
import { buildCharacter } from "@/lib/game/xp";
import { DRILL_FIELDS, METRIC_FIELDS, planFields } from "@/lib/forms";
import { getContext, getProgress } from "@/lib/data/context";
import { ensureDefaultMetrics } from "@/lib/data/metrics";
import { getXpRows } from "@/lib/data/queries";
import type { AchievementDef, BballMetric, Drill, PerformanceLog, PlanItem, PracticeDrill, PracticePlan, PracticeSession, Task } from "@/lib/types";
import { DeleteButton, SessionLoggerButton, ShotLoggerButton } from "./client";

export const metadata = { title: "Basketball" };
const TABS = [["today", "Today"], ["log", "Training log"], ["drills", "Drills & metrics"], ["plans", "Plans"], ["progress", "Progress"]] as const;

export default async function Basketball({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await getContext();
  const { supabase, today, settings, curves } = ctx;
  await ensureDefaultMetrics(supabase);
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "today";
  const from90 = addDays(today, -90);

  const [progress, xpRows, drills, plans, metrics, logs, sessions, quests, defs, unlockedRows] = await Promise.all([
    getProgress(), getXpRows(ctx, addDays(today, -6), today),
    supabase.from("drills").select("*").order("name").then((r) => (r.data ?? []) as Drill[]),
    supabase.from("practice_plans").select("*").order("name").then((r) => (r.data ?? []) as PracticePlan[]),
    supabase.from("bball_metrics").select("*").order("created_at").then((r) => (r.data ?? []) as BballMetric[]),
    supabase.from("performance_logs").select("*").gte("logged_on", from90).order("logged_on").then((r) => (r.data ?? []) as PerformanceLog[]),
    supabase.from("practice_sessions").select("*").gte("session_date", addDays(today, -120)).order("session_date", { ascending: false }).order("created_at", { ascending: false }).then((r) => (r.data ?? []) as PracticeSession[]),
    supabase.from("tasks").select("*").eq("status", "open").eq("category", "basketball").order("scheduled_date", { nullsFirst: false }).limit(80).then((r) => visibleNow((r.data ?? []) as Task[], today)),
    supabase.from("achievement_defs").select("*").eq("category", "basketball").order("sort").then((r) => (r.data ?? []) as AchievementDef[]),
    supabase.from("user_achievements").select("key,unlocked_at"),
  ]);
  const unlocked = new Map((unlockedRows.data ?? []).map((u) => [u.key as string, u.unlocked_at as string]));
  const character = buildCharacter(progress.xp_by_category, curves.overall, curves.category);
  const week = sumXpByCategory(xpRows, addDays(today, -6), today);
  const planItems = (p: PracticePlan): PlanItem[] => (Array.isArray(p.items) ? p.items : []);

  const ws = weekStart(today, settings.week_starts_on);
  const days = eachDay(ws, addDays(ws, 6));
  const practiceDays = settings.goals?.basketball?.days ?? [];
  const doneByDay = new Map<string, { n: number; min: number }>();
  for (const s of sessions) if (s.status === "done") { const e = doneByDay.get(s.session_date) ?? { n: 0, min: 0 }; e.n++; e.min += s.duration_min ?? 0; doneByDay.set(s.session_date, e); }
  const daysDoneThisWeek = days.filter((d) => doneByDay.has(d)).length;
  const target = settings.targets.practice_weekly;
  const todayPlans = plans.filter((p) => p.weekdays.includes(isoWeekday(today)));
  const drillNames = drills.filter((d) => !d.archived).map((d) => d.name);
  const plannedToday = sessions.filter((s) => s.status === "planned" && s.session_date === today);

  const header = <DomainHeader category="basketball" level={character.categories.basketball} weekXp={week.basketball} goal={settings.goals?.basketball?.goal} />;

  if (tab === "today") {
    return (
      <>
        {header}
        <SubTabs base="/basketball" tabs={TABS} current={tab} />
        <Section title="This week" hint={`${daysDoneThisWeek} of ${target} practice days${target ? "" : " (no target set)"}`}>
          <div className="card p-3.5">
            <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="Weekly practice calendar">
              {days.map((d, i) => {
                const wd = isoWeekday(d), done = doneByDay.get(d), planned = plans.filter((p) => p.weekdays.includes(wd)), isToday = d === today, isPractice = practiceDays.includes(wd);
                return (
                  <div key={d} role="listitem" className={`flex min-h-[5.5rem] flex-col items-center rounded-xl border p-1.5 text-center ${isToday ? "border-accent" : "border-line"}`} aria-label={`${formatDay(d, { weekday: "long" })}${done ? `, practised ${formatMinutes(done.min)}` : ""}`}>
                    <div className="text-[10px] font-semibold uppercase text-faint">{WEEKDAY_LABELS[wd - 1]}</div>
                    <div className="num text-sm font-semibold">{Number(d.slice(8))}</div>
                    <div className="mt-auto flex flex-col items-center gap-0.5">
                      {done ? <span className="grid size-5 place-items-center rounded-full bg-accent text-accent-ink"><Icon name="check" size={12} strokeWidth={3} /></span> : isPractice || planned.length ? <span className="size-2 rounded-full border border-basketball" title="Training day" /> : <span className="text-[10px] text-faint">rest</span>}
                      {done && <span className="num text-[10px] text-muted">{formatMinutes(done.min)}</span>}
                      {!done && planned[0] && <span className="line-clamp-1 max-w-full text-[9px] text-muted">{planned[0].name}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {target > 0 && <div className="mt-3"><ProgressBar value={daysDoneThisWeek / target} color="var(--c-basketball)" small label="Weekly practice target" /></div>}
          </div>
        </Section>

        <Section title="Today's training">
          {todayPlans.length || plannedToday.length ? (
            <ul className="space-y-2.5">
              {todayPlans.map((p) => (
                <li key={p.id} className="card flex flex-wrap items-center justify-between gap-3 p-3.5">
                  <div className="min-w-0">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">{planItems(p).map((i) => i.name).join(" · ") || "No drills yet"} · {formatMinutes(planItems(p).reduce((a, i) => a + (i.minutes ?? 0), 0))}</div>
                  </div>
                  <SessionLoggerButton today={today} plans={plans} drills={drills} plan={p} />
                </li>
              ))}
              {plannedToday.map((s) => <li key={s.id} className="card-inset p-3 text-sm">Planned: <b>{s.title}</b></li>)}
            </ul>
          ) : (
            <EmptyState icon="basketball" title="No plan for today" action={<div className="flex gap-2"><SessionLoggerButton today={today} plans={plans} drills={drills} label="Log a session" /><ResourceButton resource="practice_plans" title="New plan" fields={planFields(drillNames)} /></div>}>
              Not every drill suits every day. Make a plan per kind of day (guard skills, shooting, conditioning) and assign it to weekdays.
            </EmptyState>
          )}
        </Section>

        <Section title="Basketball quests" hint="Complete them to earn Skill XP.">
          {quests.length ? <ul className="space-y-2">{quests.slice(0, 8).map((t) => <QuestItem key={t.id} task={t} today={today} hideDomain />)}</ul> : <EmptyState icon="list-todo" title="No open basketball quests">Use “Add quest” above. Ideas like “50 free throws” are one tap away.</EmptyState>}
        </Section>
      </>
    );
  }

  if (tab === "log") {
    const ids = sessions.slice(0, 25).map((s) => s.id);
    const sessionDrills = ids.length ? ((await supabase.from("practice_drills").select("*").in("session_id", ids).order("sort_order")).data ?? []) as PracticeDrill[] : [];
    const metricName = new Map(metrics.map((m) => [m.id, m]));
    const recent = logs.slice().reverse().slice(0, 25);
    return (
      <>
        {header}
        <SubTabs base="/basketball" tabs={TABS} current={tab} />
        <div className="mb-4 flex flex-wrap gap-2"><SessionLoggerButton today={today} plans={plans} drills={drills} /><SessionLoggerButton today={today} plans={plans} drills={drills} status="planned" label="Plan a session" className="btn btn-sm" /><ShotLoggerButton today={today} metrics={metrics} /></div>
        <Section title="Practice sessions">
          {sessions.length === 0 ? <EmptyState icon="timer" title="No sessions logged yet">Log what you did today: drills, minutes and how hard it felt. Trends appear after a few sessions.</EmptyState> : (
            <ul className="space-y-2.5">
              {sessions.slice(0, 25).map((s) => {
                const dr = sessionDrills.filter((d) => d.session_id === s.id);
                return (
                  <li key={s.id} className="card p-3.5" data-testid="session">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{s.title} {s.status === "planned" && <span className="badge ml-1">Planned</span>}</div>
                        <div className="text-xs text-muted">{formatDay(s.session_date)}{s.duration_min ? ` · ${formatMinutes(s.duration_min)}` : ""}{s.intensity ? ` · intensity ${s.intensity}/10` : ""}</div>
                      </div>
                      <DeleteButton kind="session" id={s.id} label={`Delete session ${s.title}`} />
                    </div>
                    {dr.length > 0 && (
                      <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted">{dr.length} drill{dr.length === 1 ? "" : "s"}</summary>
                        <ul className="mt-1.5 space-y-1">{dr.map((d) => <li key={d.id} className="flex justify-between gap-3 text-xs"><span>{d.completed ? "✓ " : ""}{d.name}</span><span className="num text-muted">{d.done_reps != null ? `${d.done_reps}${d.planned_reps ? `/${d.planned_reps}` : ""} reps` : d.planned_reps ? `${d.planned_reps} reps` : ""}{d.minutes ? ` · ${d.minutes}m` : ""}</span></li>)}</ul>
                      </details>
                    )}
                    {s.notes && <p className="mt-2 text-sm text-muted">{s.notes}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        <Section title="Shooting & results">
          {recent.length === 0 ? <p className="text-sm text-muted">Shooting entries and other results show up here.</p> : (
            <ul className="space-y-1.5">
              {recent.map((l) => {
                const m = metricName.get(l.metric_id);
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="min-w-0"><b>{m?.name ?? "Metric"}</b> <span className="text-muted">· {formatDay(l.logged_on)}</span></span>
                    <span className="flex items-center gap-2"><span className="num">{l.attempts != null ? `${l.makes ?? 0}/${l.attempts}${l.makes != null ? ` (${Math.round((l.makes / l.attempts) * 100)}%)` : ""}` : `${l.value}${m?.unit ? ` ${m.unit}` : ""}`}</span><DeleteButton kind="shot" id={l.id} label="Delete entry" /></span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </>
    );
  }

  if (tab === "drills") {
    return (
      <>
        {header}
        <SubTabs base="/basketball" tabs={TABS} current={tab} />
        <Section title="Drill library" hint="Your own drills, with default time and reps." actions={<ResourceButton resource="drills" title="New drill" fields={DRILL_FIELDS} className="btn btn-primary btn-sm" />}>
          {drills.length === 0 ? <EmptyState icon="target" title="No drills yet">Add the drills you actually use. Group them by skill, and build plans from them.</EmptyState> : (
            <div className="space-y-4">
              {SKILLS.filter((s) => drills.some((d) => d.skill === s)).map((s: Skill) => (
                <div key={s}>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">{SKILL_LABEL[s]}</div>
                  <ul className="space-y-1.5">
                    {drills.filter((d) => d.skill === s).map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                        <div className="min-w-0"><div className="text-sm font-medium">{d.name} {d.is_sample && <span className="badge ml-1">Sample</span>} {d.archived && <span className="badge ml-1">Archived</span>}</div><div className="text-xs text-muted">{[d.default_minutes && `${d.default_minutes} min`, d.default_reps && `${d.default_reps} reps`].filter(Boolean).join(" · ") || "No defaults"}</div></div>
                        <ResourceButton resource="drills" title={d.name} fields={DRILL_FIELDS} initial={d as unknown as Record<string, unknown>} id={d.id} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Metrics you track" hint="Free throws, threes and midrange are set up for you. Add your own." actions={<ResourceButton resource="bball_metrics" title="New metric" fields={METRIC_FIELDS} />}>
          <ul className="space-y-1.5">
            {metrics.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
                <span><b>{m.name}</b> <span className="text-muted">· {m.kind === "shooting" ? "makes / attempts" : `value${m.unit ? ` (${m.unit})` : ""}, ${m.direction} is better`}</span></span>
                <ResourceButton resource="bball_metrics" title={m.name} fields={METRIC_FIELDS} initial={m as unknown as Record<string, unknown>} id={m.id} />
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  }

  if (tab === "plans") {
    return (
      <>
        {header}
        <SubTabs base="/basketball" tabs={TABS} current={tab} />
        <Section title="Practice plans" hint="One per kind of day. Assign weekdays and they appear on your calendar." actions={<ResourceButton resource="practice_plans" title="New plan" fields={planFields(drillNames)} className="btn btn-primary btn-sm" />}>
          {plans.length === 0 ? <EmptyState icon="list-checks" title="No plans yet">A plan is a reusable list of drills with minutes and reps.</EmptyState> : (
            <ul className="space-y-2.5">
              {plans.map((p) => (
                <li key={p.id} className="card p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="font-semibold">{p.name} {p.is_sample && <span className="badge ml-1">Sample</span>}</div><div className="text-xs text-muted">{p.weekdays.length ? p.weekdays.map((d) => WEEKDAY_LABELS[d - 1]).join(", ") : "Any day"}</div></div>
                    <div className="flex items-center gap-1"><SessionLoggerButton today={today} plans={plans} drills={drills} plan={p} label="Start" className="btn btn-sm" /><ResourceButton resource="practice_plans" title={p.name} fields={planFields(drillNames)} initial={p as unknown as Record<string, unknown>} id={p.id} /></div>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-sm text-muted">{planItems(p).map((i, idx) => <li key={idx}>{i.name}{i.minutes ? ` · ${i.minutes}m` : ""}{i.reps ? ` · ${i.reps} reps` : ""}</li>)}</ul>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </>
    );
  }

  // progress
  const shooting = metrics.map((m) => summariseMetric(m, logs));
  const lineSeries: Series[] = shooting.filter((s) => s.series.length).map((s, i) => ({ key: s.metric.id, label: s.metric.name, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  const dayKeys = [...new Set(shooting.flatMap((s) => s.series.map((p) => p.day)))].sort();
  const lineData = dayKeys.map((day) => ({ day, ...Object.fromEntries(shooting.map((s) => [s.metric.id, s.series.find((p) => p.day === day)?.value ?? null])) }));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today, settings.week_starts_on), -7 * (7 - i)));
  const weekly = weeks.map((w) => ({ day: w, hours: Math.round(sessions.filter((s) => s.status === "done" && s.session_date >= w && s.session_date <= addDays(w, 6)).reduce((a, s) => a + (s.duration_min ?? 0), 0) / 6) / 10 }));
  const intensityPts = sessions.filter((s) => s.status === "done" && s.intensity).slice(0, 14).reverse().map((s) => ({ day: s.session_date, intensity: s.intensity! }));
  const hasLogs = lineSeries.length > 0;
  return (
    <>
      {header}
      <SubTabs base="/basketball" tabs={TABS} current={tab} />
      <Section title="Personal bests" hint={`Shooting bests count days with at least 20 attempts, so a lucky 3-for-3 isn't a record.`}>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {shooting.map((s) => (
            <Stat key={s.metric.id} label={s.metric.name} value={s.best ? `${Math.round(s.best.value * 10) / 10}${s.metric.kind === "shooting" ? "%" : s.metric.unit ? ` ${s.metric.unit}` : ""}` : "—"}
              sub={s.best ? <>Best on {formatDay(s.best.day)}{s.latest && s.previous ? ` · last ${Math.round(s.latest.value)}% (was ${Math.round(s.previous.value)}%)` : ""}</> : s.entries ? `${s.totalAttempts} attempts logged. Need a day with 20+ for a best.` : "No entries yet"} />
          ))}
        </div>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Shooting percentage by day" subtitle="Days with 20+ attempts · recorded values" legend={lineSeries} empty={hasLogs ? null : "Log shots with 20+ attempts in a day to see your trend."}
          table={{ columns: ["Day", ...lineSeries.map((s) => s.label)], rows: lineData.map((r) => [r.day as string, ...lineSeries.map((s) => (r as Record<string, unknown>)[s.key] == null ? "—" : `${Math.round(Number((r as Record<string, unknown>)[s.key]))}%`)]) }}>
          <Lines data={lineData} series={lineSeries} unit="%" yDomain={[0, 100]} label="Shooting percentage" />
        </ChartFrame>
        <ChartFrame title="Practice hours per week" subtitle="Last 8 weeks · recorded durations" empty={weekly.some((w) => w.hours > 0) ? null : "Log practice sessions with a duration to see your weekly hours."}
          table={{ columns: ["Week of", "Hours"], rows: weekly.map((w) => [w.day, w.hours]) }}>
          <SimpleBars data={weekly} dataKey="hours" label="Hours" color="var(--c-basketball)" unit=" h" />
        </ChartFrame>
        {intensityPts.length >= 3 && (
          <ChartFrame title="Session intensity" subtitle="Last sessions · your own 1–10 rating" table={{ columns: ["Day", "Intensity"], rows: intensityPts.map((p) => [p.day, p.intensity]) }}>
            <Lines data={intensityPts} series={[{ key: "intensity", label: "Intensity", color: "var(--c-basketball)" }]} yDomain={[0, 10]} label="Session intensity" />
          </ChartFrame>
        )}
      </div>
      <Section title="Basketball achievements" className="mt-6"><AchievementList defs={defs} unlocked={unlocked} metrics={progress.metrics} compact /></Section>
      {!hasLogs && <Notice className="mt-4">Charts and bests only use what you record. Nothing here is estimated.</Notice>}
    </>
  );
}
