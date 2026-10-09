import Link from "next/link";
import { AchievementList } from "@/components/achievement-list";
import { ChartFrame, Lines, SimpleBars } from "@/components/charts";
import { DomainHeader, SubTabs } from "@/components/domain-header";
import { Icon } from "@/components/icon";
import { QuestItem } from "@/components/quest-item";
import { ResourceButton } from "@/components/resource-form";
import { EmptyState, Notice, ProgressBar, Section, Stat } from "@/components/ui";
import { WEEKDAY_LABELS } from "@/lib/constants";
import { addDays, eachDay, formatDay, formatMinutes, isoWeekday, weekStart } from "@/lib/dates";
import { sumXpByCategory } from "@/lib/game/analytics";
import { visibleNow } from "@/lib/game/planner";
import { est1RM, personalRecords, trainingLoadWarning, weightTrend } from "@/lib/game/domain";
import { buildCharacter } from "@/lib/game/xp";
import { bodyFields, mealFields, routineFields } from "@/lib/forms";
import { getContext, getProgress } from "@/lib/data/context";
import { getXpRows } from "@/lib/data/queries";
import type { AchievementDef, BodyMetric, HealthDay, NutritionEntry, Task, Workout, WorkoutRoutine, WorkoutSet } from "@/lib/types";
import { DeleteWorkout, MobilityControls, RestToggle, SleepForm, WaterControls, WorkoutLoggerButton } from "./client";

export const metadata = { title: "Health & Physique" };
const TABS = [["today", "Today"], ["workouts", "Workouts"], ["body", "Body"], ["progress", "Progress"]] as const;

export default async function Health({ searchParams }: { searchParams: Promise<{ tab?: string; ex?: string }> }) {
  const ctx = await getContext();
  const { supabase, today, settings, curves } = ctx;
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "today";
  const from90 = addDays(today, -90);
  const t = settings.targets;

  const [progress, xpRows, days, meals, routines, workouts, sets, body, quests, templates, defs, unlockedRows] = await Promise.all([
    getProgress(), getXpRows(ctx, addDays(today, -6), today),
    supabase.from("health_days").select("*").gte("day", from90).order("day").then((r) => (r.data ?? []) as HealthDay[]),
    supabase.from("nutrition_entries").select("*").gte("logged_on", addDays(today, -30)).order("created_at").then((r) => (r.data ?? []) as NutritionEntry[]),
    supabase.from("workout_routines").select("*").order("name").then((r) => (r.data ?? []) as WorkoutRoutine[]),
    supabase.from("workouts").select("*").gte("workout_date", from90).order("workout_date", { ascending: false }).order("created_at", { ascending: false }).then((r) => (r.data ?? []) as Workout[]),
    supabase.from("workout_sets").select("*").order("created_at").limit(3000).then((r) => (r.data ?? []) as WorkoutSet[]),
    supabase.from("body_metrics").select("*").order("logged_on").then((r) => (r.data ?? []) as BodyMetric[]),
    supabase.from("tasks").select("*").eq("status", "open").eq("category", "health").order("scheduled_date", { nullsFirst: false }).limit(80).then((r) => visibleNow((r.data ?? []) as Task[], today)),
    supabase.from("tasks").select("*").eq("status", "template").eq("category", "health").then((r) => (r.data ?? []) as Task[]),
    supabase.from("achievement_defs").select("*").eq("category", "health").order("sort").then((r) => (r.data ?? []) as AchievementDef[]),
    supabase.from("user_achievements").select("key,unlocked_at"),
  ]);
  const unlocked = new Map((unlockedRows.data ?? []).map((u) => [u.key as string, u.unlocked_at as string]));
  const character = buildCharacter(progress.xp_by_category, curves.overall, curves.category);
  const week = sumXpByCategory(xpRows, addDays(today, -6), today);
  const dayRow = days.find((d) => d.day === today);
  const todayMeals = meals.filter((m) => m.logged_on === today);
  const protein = todayMeals.reduce((a, m) => a + Number(m.protein_g), 0);
  const kcal = todayMeals.reduce((a, m) => a + (m.calories ?? 0), 0);
  const header = <DomainHeader category="health" level={character.categories.health} weekXp={week.health} goal={settings.goals?.health?.goal} />;
  const routineItems = (r: WorkoutRoutine) => (Array.isArray(r.exercises) ? r.exercises : []);
  const setsByWorkout = new Map<string, WorkoutSet[]>();
  for (const s of sets) setsByWorkout.set(s.workout_id, [...(setsByWorkout.get(s.workout_id) ?? []), s]);

  if (tab === "today") {
    const todayRoutine = routines.find((r) => r.weekdays.includes(isoWeekday(today)));
    const restDays = days.filter((d) => d.is_rest_day).map((d) => d.day);
    const warn = trainingLoadWarning(workouts.map((w) => w.workout_date), restDays, today);
    const doneToday = workouts.some((w) => w.workout_date === today);
    return (
      <>
        {header}
        <SubTabs base="/health" tabs={TABS} current={tab} />
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <RestToggle day={today} on={!!dayRow?.is_rest_day} />
          <WorkoutLoggerButton today={today} routines={routines} suggested={todayRoutine && !doneToday ? todayRoutine : undefined} />
          {dayRow?.is_rest_day && <span className="text-sm text-good">Rest day. Recovery counts as part of the plan.</span>}
        </div>
        {warn && <Notice tone="warn" className="mb-5">{warn}</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Tracker icon="droplets" title="Water" value={`${dayRow?.water_ml ?? 0} ml`} target={`${t.water_ml} ml`} pct={t.water_ml ? (dayRow?.water_ml ?? 0) / t.water_ml : 0}><WaterControls day={today} ml={dayRow?.water_ml ?? 0} /></Tracker>
          <Tracker icon="beef" title="Protein" value={`${Math.round(protein)} g`} target={`${t.protein_g} g`} pct={t.protein_g ? protein / t.protein_g : 0} extra={kcal ? `${kcal} kcal logged${t.calories ? ` of ${t.calories}` : ""}` : undefined}>
            <div className="flex flex-wrap gap-1.5"><ResourceButton resource="nutrition_entries" title="Log a meal" fields={mealFields(today)} icon="plus" /></div>
            {todayMeals.length > 0 && <ul className="mt-2 space-y-1">{todayMeals.map((m) => <li key={m.id} className="flex items-center justify-between text-xs text-muted"><span>{m.label}</span><span className="flex items-center gap-1"><span className="num">{Number(m.protein_g)} g{m.calories ? ` · ${m.calories} kcal` : ""}</span><ResourceButton resource="nutrition_entries" title={m.label} fields={mealFields(today)} initial={m as unknown as Record<string, unknown>} id={m.id} /></span></li>)}</ul>}
          </Tracker>
          <Tracker icon="timer" title="Mobility & stretching" value={`${dayRow?.mobility_min ?? 0} min`} target={`${t.mobility_min} min`} pct={t.mobility_min ? (dayRow?.mobility_min ?? 0) / t.mobility_min : 0}><MobilityControls day={today} minutes={dayRow?.mobility_min ?? 0} /></Tracker>
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon name="bed" size={16} className="text-health" />Sleep <span className="ml-auto text-xs font-normal text-muted">healthy range {t.sleep_min_h}–{t.sleep_max_h} h</span></div>
            <SleepForm day={today} hours={dayRow?.sleep_hours != null ? Number(dayRow.sleep_hours) : null} quality={dayRow?.sleep_quality ?? null} min={Number(t.sleep_min_h)} max={Number(t.sleep_max_h)} />
          </div>
        </div>
        {todayRoutine && <Notice className="mt-5">Planned today: <b>{todayRoutine.name}</b> ({routineItems(todayRoutine).map((e) => e.name).join(", ") || "no exercises yet"}).</Notice>}
        <Section title="Health quests" className="mt-6" hint="Auto-checked ones pay XP only after you've logged the matching data.">
          {quests.length ? <ul className="space-y-2">{quests.slice(0, 8).map((q) => <QuestItem key={q.id} task={q} today={today} hideDomain />)}</ul> : <EmptyState icon="list-todo" title="No open health quests">Use “Add quest”. “Hit my protein target” and “10 minutes of mobility” are auto-checked.</EmptyState>}
        </Section>
        <p className="text-xs text-muted">Targets are yours to set (Settings). This is a self-check, not medical advice. Eating too little, training through exhaustion and sleeping less are never rewarded.</p>
      </>
    );
  }

  if (tab === "workouts") {
    const prs = personalRecords(sets.map((s) => ({ exercise: s.exercise, reps: s.reps, weight_kg: Number(s.weight_kg), workout_date: workouts.find((w) => w.id === s.workout_id)?.workout_date })));
    return (
      <>
        {header}
        <SubTabs base="/health" tabs={TABS} current={tab} />
        <div className="mb-4 flex flex-wrap gap-2"><WorkoutLoggerButton today={today} routines={routines} /><ResourceButton resource="workout_routines" title="New routine" fields={routineFields} /></div>
        <Section title="Routines">
          {routines.length === 0 ? <EmptyState icon="dumbbell" title="No routines yet">Build your own split (push / pull / legs, full body, anything), then log workouts from it in a few taps.</EmptyState> : (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {routines.map((r) => (
                <li key={r.id} className="card p-3.5">
                  <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{r.name} {r.is_sample && <span className="badge ml-1">Sample</span>}</div><div className="text-xs text-muted">{r.weekdays.length ? r.weekdays.map((d) => WEEKDAY_LABELS[d - 1]).join(", ") : "Any day"}</div></div><ResourceButton resource="workout_routines" title={r.name} fields={routineFields} initial={r as unknown as Record<string, unknown>} id={r.id} /></div>
                  <ul className="mt-2 space-y-0.5 text-sm text-muted">{routineItems(r).map((e, i) => <li key={i}>{e.name}{e.sets ? ` · ${e.sets}×${e.reps ?? "?"}` : ""}{e.weight_kg ? ` @ ${e.weight_kg} kg` : ""}</li>)}</ul>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Personal records" hint="Estimated one-rep max (Epley) is a calculation from your sets, not a tested max.">
          {prs.length === 0 ? <p className="text-sm text-muted">Log sets with weight and reps to see records.</p> : (
            <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full text-left text-sm"><thead className="bg-raised text-xs text-muted"><tr><th className="px-3 py-2" scope="col">Exercise</th><th className="px-3 py-2" scope="col">Heaviest set</th><th className="px-3 py-2" scope="col">Est. 1RM</th><th className="px-3 py-2" scope="col">Sets</th></tr></thead>
              <tbody>{prs.slice(0, 12).map((p) => <tr key={p.exercise} className="border-t border-line"><td className="px-3 py-2 font-medium">{p.exercise}</td><td className="num px-3 py-2">{p.maxWeight} kg × {p.maxWeightReps}</td><td className="num px-3 py-2">{Math.round(p.best1RM * 10) / 10} kg</td><td className="num px-3 py-2">{p.sets}</td></tr>)}</tbody></table></div>
          )}
        </Section>
        <Section title="Workout log">
          {workouts.length === 0 ? <p className="text-sm text-muted">Nothing logged yet.</p> : (
            <ul className="space-y-2">{workouts.slice(0, 20).map((w) => {
              const ws = setsByWorkout.get(w.id) ?? [];
              return (
                <li key={w.id} className="card p-3.5" data-testid="workout">
                  <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{w.name}</div><div className="text-xs text-muted">{formatDay(w.workout_date)}{w.duration_min ? ` · ${formatMinutes(w.duration_min)}` : ""}{w.intensity ? ` · intensity ${w.intensity}/10` : ""} · {ws.length} sets</div></div><DeleteWorkout id={w.id} name={w.name} /></div>
                  {ws.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted">Sets</summary><ul className="mt-1 space-y-0.5 text-xs">{ws.map((s) => <li key={s.id} className="flex justify-between"><span>{s.exercise} · set {s.set_no}</span><span className="num text-muted">{Number(s.weight_kg)} kg × {s.reps}</span></li>)}</ul></details>}
                </li>
              );
            })}</ul>
          )}
        </Section>
      </>
    );
  }

  if (tab === "body") {
    const weights = body.filter((b) => b.kind.toLowerCase() === "bodyweight").map((b) => ({ day: b.logged_on, value: Number(b.value) }));
    const trend = weightTrend(weights, today);
    const kinds = [...new Set(body.map((b) => b.kind))].filter((k) => k.toLowerCase() !== "bodyweight");
    return (
      <>
        {header}
        <SubTabs base="/health" tabs={TABS} current={tab} />
        <div className="mb-4"><ResourceButton resource="body_metrics" title="Log weight or measurement" fields={bodyFields(today)} className="btn btn-primary btn-sm" /></div>
        <ChartFrame title="Bodyweight" subtitle={weights.length ? `${weights.length} weigh-ins · recorded` : "No weigh-ins yet"} empty={weights.length >= 2 ? null : "Log your weight on a few days to see a trend."} table={{ columns: ["Date", "kg"], rows: weights.slice().reverse().map((w) => [w.day, w.value]) }}>
          <Lines data={weights} series={[{ key: "value", label: "Bodyweight (kg)", color: "var(--c-health)" }]} unit=" kg" label="Bodyweight" />
        </ChartFrame>
        <p className="mt-2 text-xs text-muted">{trend ? <>Trend over the last {trend.days} days: <b className="num text-ink">{trend.perWeek >= 0 ? "+" : ""}{Math.round(trend.perWeek * 100) / 100} kg/week</b> <span className="badge ml-1">estimate</span>. A straight-line fit through your weigh-ins; day-to-day swings of 1–2 kg are normal.</> : "A trend needs at least four weigh-ins spread over two weeks. Until then, only your actual entries are shown."}</p>
        <Section title="Measurements" className="mt-6" hint="Custom measurements: add any you care about.">
          {kinds.length === 0 ? <p className="text-sm text-muted">Log waist, chest, arm… from the button above.</p> : (
            <ul className="grid gap-2.5 sm:grid-cols-2">{kinds.map((k) => { const list = body.filter((b) => b.kind === k); const last = list.at(-1)!, first = list[0]; return <Stat key={k} label={k} value={`${Number(last.value)} ${last.unit}`} sub={list.length > 1 ? `${Number(last.value) - Number(first.value) >= 0 ? "+" : ""}${Math.round((Number(last.value) - Number(first.value)) * 10) / 10} ${last.unit} since ${formatDay(first.logged_on)}` : `logged ${formatDay(last.logged_on)}`} />; })}</ul>
          )}
        </Section>
        <Section title="Recent entries"><ul className="space-y-1.5">{body.slice().reverse().slice(0, 12).map((b) => <li key={b.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"><span>{b.kind} <span className="text-muted">· {formatDay(b.logged_on)}</span></span><span className="flex items-center gap-1"><span className="num">{Number(b.value)} {b.unit}</span><ResourceButton resource="body_metrics" title={b.kind} fields={bodyFields(today)} initial={b as unknown as Record<string, unknown>} id={b.id} /></span></li>)}</ul></Section>
      </>
    );
  }

  // progress
  const exNames = personalRecords(sets.map((s) => ({ exercise: s.exercise, reps: s.reps, weight_kg: Number(s.weight_kg) }))).map((p) => p.exercise);
  const ex = exNames.find((n) => n === sp.ex) ?? exNames[0];
  const wd = new Map(workouts.map((w) => [w.id, w.workout_date]));
  const perDay = new Map<string, number>();
  for (const s of sets) if (ex && s.exercise.toLowerCase() === ex.toLowerCase() && Number(s.weight_kg) > 0) { const d = wd.get(s.workout_id); if (d) perDay.set(d, Math.max(perDay.get(d) ?? 0, est1RM(Number(s.weight_kg), s.reps))); }
  const strength = [...perDay].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, value]) => ({ day, e1rm: Math.round(value * 10) / 10 }));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today, settings.week_starts_on), -7 * (7 - i)));
  const perWeek = weeks.map((w) => ({ day: w, workouts: workouts.filter((x) => x.workout_date >= w && x.workout_date <= addDays(w, 6)).length }));
  const last30 = eachDay(addDays(today, -29), today);
  const sleepPts = last30.map((d) => { const r = days.find((x) => x.day === d); return { day: d, hours: r?.sleep_hours != null ? Number(r.sleep_hours) : null }; });
  const habitGrid = templates.length ? await habitHistory(ctx, templates, today) : [];
  return (
    <>
      {header}
      <SubTabs base="/health" tabs={TABS} current={tab} />
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Workouts, 8 weeks" value={perWeek.reduce((a, w) => a + w.workouts, 0)} sub={t.workouts_weekly ? `target ${t.workouts_weekly}/week` : "no target"} />
        <Stat label="Protein days" value={progress.metrics.protein_days ?? 0} sub="hit your target" />
        <Stat label="Hydrated days" value={progress.metrics.water_days ?? 0} sub="hit your target" />
        <Stat label="Well-slept days" value={progress.metrics.sleep_days ?? 0} sub={`${t.sleep_min_h}–${t.sleep_max_h} h`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Workouts per week" subtitle="Last 8 weeks · recorded" empty={perWeek.some((w) => w.workouts) ? null : "Log workouts to see consistency."} table={{ columns: ["Week of", "Workouts"], rows: perWeek.map((w) => [w.day, w.workouts]) }}>
          <SimpleBars data={perWeek} dataKey="workouts" label="Workouts" color="var(--c-health)" target={t.workouts_weekly || undefined} />
        </ChartFrame>
        <ChartFrame title={ex ? `Strength: ${ex}` : "Strength"} subtitle="Estimated one-rep max per workout (a calculation, not a tested max)" empty={strength.length >= 2 ? null : "Log the same lift with weight on two or more days."} table={{ columns: ["Day", "Est. 1RM (kg)"], rows: strength.map((s) => [s.day, s.e1rm]) }}>
          <>
            {exNames.length > 1 && <div className="mb-2 flex flex-wrap gap-1.5">{exNames.slice(0, 8).map((n) => <Link key={n} href={`/health?tab=progress&ex=${encodeURIComponent(n)}`} className="chip" data-active={n === ex}>{n}</Link>)}</div>}
            <Lines data={strength} series={[{ key: "e1rm", label: "Est. 1RM (kg)", color: "var(--c-health)" }]} unit=" kg" label="Estimated one-rep max" />
          </>
        </ChartFrame>
        <ChartFrame title="Sleep" subtitle={`Last 30 days · healthy range ${t.sleep_min_h}–${t.sleep_max_h} h`} empty={sleepPts.some((p) => p.hours != null) ? null : "Log your sleep to see it here."} table={{ columns: ["Day", "Hours"], rows: sleepPts.filter((p) => p.hours != null).map((p) => [p.day, p.hours as number]) }}>
          <Lines data={sleepPts} series={[{ key: "hours", label: "Sleep (h)", color: "var(--c-health)" }]} unit=" h" yDomain={[0, 12]} label="Sleep hours" />
        </ChartFrame>
      </div>
      {habitGrid.length > 0 && (
        <Section title="Habit history" className="mt-6" hint="Last 28 days. Filled = done, dash = skipped on purpose, empty = not done.">
          <ul className="space-y-3">{habitGrid.map((h) => (
            <li key={h.title} className="card p-3.5"><div className="mb-2 text-sm font-semibold">{h.title}</div>
              <div className="flex flex-wrap gap-1" role="img" aria-label={`${h.title}: ${h.cells.filter((c) => c.state === "done").length} of the last 28 days done`}>{h.cells.map((c) => <span key={c.day} title={`${formatDay(c.day)}: ${c.state}`} className="grid size-5 place-items-center rounded-md border text-[10px]" style={{ background: c.state === "done" ? "var(--c-health)" : "transparent", borderColor: c.state === "none" ? "transparent" : "var(--line)", color: "var(--muted)" }}>{c.state === "skipped" ? "–" : ""}</span>)}</div>
            </li>))}</ul>
        </Section>
      )}
      <Section title="Health achievements" className="mt-6"><AchievementList defs={defs} unlocked={unlocked} metrics={progress.metrics} compact /></Section>
    </>
  );
}

function Tracker({ icon, title, value, target, pct, extra, children }: { icon: string; title: string; value: string; target: string; pct: number; extra?: string; children?: React.ReactNode }) {
  const met = pct >= 1;
  return (
    <div className="card p-4" data-testid={`tracker-${title.split(" ")[0].toLowerCase()}`}>
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Icon name={icon} size={16} className="text-health" />{title}<span className="ml-auto text-xs font-normal text-muted">target {target}</span></div>
      <div className="mb-2 flex items-baseline gap-2"><span className="num text-2xl font-bold">{value}</span>{met && <span className="text-xs text-good">target reached</span>}</div>
      <ProgressBar value={pct} color="var(--c-health)" small label={`${title} progress`} />
      {extra && <p className="mt-1.5 text-xs text-muted">{extra}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

async function habitHistory(ctx: Awaited<ReturnType<typeof getContext>>, templates: Task[], today: string) {
  const from = addDays(today, -27);
  const { data } = await ctx.supabase.from("tasks").select("template_id,scheduled_date,status").in("template_id", templates.map((t) => t.id)).gte("scheduled_date", from).lte("scheduled_date", today);
  const days = eachDay(from, today);
  return templates.map((t) => ({
    title: t.title,
    cells: days.map((day) => {
      const r = (data ?? []).find((x) => x.template_id === t.id && x.scheduled_date === day);
      return { day, state: !r ? "none" : r.status === "done" ? "done" : r.status === "skipped" ? "skipped" : "open" } as { day: string; state: "none" | "done" | "skipped" | "open" };
    }),
  }));
}
