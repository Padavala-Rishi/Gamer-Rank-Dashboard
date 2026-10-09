import Link from "next/link";
import { CapacityMeter } from "@/components/capacity";
import { QuestItem, type QuestView } from "@/components/quest-item";
import { EmptyState, Notice, PageHeader, Section } from "@/components/ui";
import { addDays, formatDay, relativeDay } from "@/lib/dates";
import { availableMinutes, bucketTasks, dayLoad, pickMinimumViableDay, recommendedWorkload } from "@/lib/game/planner";
import { getContext } from "@/lib/data/context";
import { getCompletions, getDayPlan, getOpenTasks } from "@/lib/data/queries";
import { ensureRecurring } from "@/lib/data/recurring";
import type { Task } from "@/lib/types";
import { MvdToggle, PullButton, ReviewButton } from "./day-tools";
import { SortableQuests } from "./sortable";

export const metadata = { title: "Quests" };

const VIEWS = [["today", "Today"], ["upcoming", "Upcoming"], ["backlog", "Backlog"], ["weekly", "Weekly & Boss"], ["repeating", "Repeating"], ["done", "Completed"]] as const;
const byOrder = (a: Task, b: Task) => a.sort_order - b.sort_order || a.priority - b.priority;

export default async function QuestsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await getContext();
  const { supabase, today, settings } = ctx;
  await ensureRecurring(supabase, today);
  const sp = await searchParams;
  const view = VIEWS.find(([k]) => k === sp.view)?.[0] ?? "today";

  const [open, templates, children, plan, doneToday] = await Promise.all([
    getOpenTasks(ctx),
    supabase.from("tasks").select("*").eq("status", "template").order("created_at").then((r) => (r.data ?? []) as Task[]),
    supabase.from("tasks").select("parent_id,status").not("parent_id", "is", null).in("status", ["open", "done"]).then((r) => r.data ?? []),
    getDayPlan(ctx, today),
    getCompletions(ctx, today, today),
  ]);

  const counts = new Map<string, { total: number; open: number }>();
  for (const c of children as { parent_id: string; status: string }[]) {
    const e = counts.get(c.parent_id) ?? { total: 0, open: 0 };
    e.total++; if (c.status === "open") e.open++;
    counts.set(c.parent_id, e);
  }
  const withKids = (t: Task): QuestView => ({ ...t, childTotal: counts.get(t.id)?.total ?? 0, childOpen: counts.get(t.id)?.open ?? 0 });
  const openChildrenOf = new Set([...counts].filter(([, v]) => v.open > 0).map(([k]) => k));
  // sub-quests live under their boss quest; hide them from the flat lists unless they're scheduled
  const flat = open.filter((t) => !t.parent_id || t.scheduled_date);

  const tabs = (
    <nav className="tabs mb-5" aria-label="Quest views">
      {VIEWS.map(([k, l]) => <Link key={k} href={k === "today" ? "/quests" : `/quests?view=${k}`} className="tab" aria-current={view === k ? "page" : undefined}>{l}</Link>)}
    </nav>
  );

  if (view === "today") {
    const b = bucketTasks(flat, today);
    const mvdOn = !!plan?.mvd;
    const picks = mvdOn ? pickMinimumViableDay(b.today.concat(b.overdue), today, settings) : [];
    const pickIds = new Set(picks.map((p) => p.id));
    const todayList = (mvdOn ? b.today.filter((t) => pickIds.has(t.id)) : b.today).sort(byOrder);
    const overdue = (mvdOn ? b.overdue.filter((t) => pickIds.has(t.id)) : b.overdue);
    const paused = mvdOn ? [...b.today, ...b.overdue].filter((t) => !pickIds.has(t.id)) : [];
    const load = dayLoad(b.today, today);
    const free = availableMinutes(today, settings);
    const rec = recommendedWorkload(today, settings, mvdOn);
    const xpToday = doneToday.reduce((a, d) => a + d.xp_awarded, 0);
    const pull = b.backlog.slice().sort(byOrder).slice(0, 3);
    const left = [...b.today, ...b.overdue].map((t) => ({ id: t.id, title: t.title, overdue: !!t.scheduled_date && t.scheduled_date < today }));

    return (
      <>
        <PageHeader title="Quest board" subtitle={formatDay(today, { weekday: "long", day: "numeric", month: "long" })}
          actions={<><MvdToggle day={today} on={mvdOn} /><ReviewButton day={today} left={left} doneCount={doneToday.length} xpToday={xpToday} existing={plan?.review ?? null} /></>} />
        {tabs}
        <div className="card mb-5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Today's load</h2>
            <span className="text-xs text-muted">Suggested: ~{rec.tasks} quest{rec.tasks === 1 ? "" : "s"}, {Math.round(rec.minutes / 5) * 5} min</span>
          </div>
          <CapacityMeter load={load} free={free} limit={settings.daily_task_limit} />
        </div>
        {mvdOn && <Notice className="mb-5">Minimum Viable Day is on. Do these {picks.length || "few"} and today still counts: streak, XP and all. Everything else is paused, not lost.</Notice>}

        {overdue.length > 0 && (
          <Section title="Carried over" hint="Unfinished from earlier days. Do it, move it, or let it go; nothing is held against you.">
            <ul className="space-y-2">{overdue.map((t) => <QuestItem key={t.id} task={withKids(t)} today={today} />)}</ul>
          </Section>
        )}
        <Section title={mvdOn ? "The essentials" : "Today"}>
          {todayList.length ? <SortableQuests tasks={todayList.map(withKids)} today={today} /> : (
            <EmptyState icon="circle-check" title={doneToday.length ? "Everything planned for today is done" : "Nothing planned for today"}
              action={<p className="text-sm text-muted">Use the + button to add a quest{pull.length ? ", or pull one in from your backlog below" : ""}.</p>}>
              {doneToday.length ? "Rest is part of the plan. You can still add more, but you don't have to." : "A short, realistic list beats a long one."}
            </EmptyState>
          )}
        </Section>
        {doneToday.length > 0 && (
          <Section title={`Done today · ${doneToday.length}`}>
            <ul className="space-y-2">
              {doneToday.filter((d) => d.tasks).map((d) => <QuestItem key={d.id} doneXp={d.xp_awarded} today={today} task={{ ...(d.tasks as unknown as Task), status: "done", category: d.category, quest_type: d.tasks!.quest_type, verify: null, recurrence: null, notes: null, description: null, subcategory: null, priority: 2, scheduled_time: null, due_date: null, sort_order: 0, template_id: null, subject_id: null, project_id: null }} />)}
            </ul>
          </Section>
        )}
        {paused.length > 0 && (
          <details className="mb-6"><summary className="cursor-pointer text-sm text-muted">Paused for today ({paused.length})</summary>
            <ul className="mt-2 space-y-2">{paused.map((t) => <QuestItem key={t.id} task={withKids(t)} today={today} />)}</ul>
          </details>
        )}
        {pull.length > 0 && !mvdOn && (
          <Section title="From your backlog" hint="Add one if there's room. The planner won't let you overfill the day.">
            <ul className="space-y-2">
              {pull.map((t) => <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5"><span className="min-w-0 truncate text-sm">{t.title}</span><PullButton id={t.id} title={t.title} day={today} /></li>)}
            </ul>
          </Section>
        )}
      </>
    );
  }

  if (view === "upcoming") {
    const future = flat.filter((t) => t.scheduled_date && t.scheduled_date > today).sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1) || byOrder(a, b));
    const days = [...new Set(future.map((t) => t.scheduled_date!))];
    return (
      <>
        <PageHeader title="Upcoming" subtitle="What's already scheduled." />
        {tabs}
        {days.length === 0 ? <EmptyState icon="calendar-days" title="Nothing scheduled ahead">Add quests with a date, or create a repeating quest.</EmptyState> : days.map((d) => {
          const list = future.filter((t) => t.scheduled_date === d);
          return (
            <Section key={d} title={relativeDay(d, today)} hint={`${formatDay(d)} · ${list.length} quest${list.length === 1 ? "" : "s"} · free ${Math.round(availableMinutes(d, settings) / 6) / 10}h`}>
              <ul className="space-y-2">{list.map((t) => <QuestItem key={t.id} task={withKids(t)} today={today} />)}</ul>
            </Section>
          );
        })}
      </>
    );
  }

  if (view === "backlog") {
    const list = flat.filter((t) => !t.scheduled_date && !["weekly", "boss", "challenge"].includes(t.quest_type)).sort(byOrder);
    return (
      <>
        <PageHeader title="Backlog" subtitle="Ideas and quests without a day. Pull them in when there's room." />
        {tabs}
        {list.length === 0 ? <EmptyState icon="inbox" title="The backlog is empty">Unscheduled quests wait here.</EmptyState> : (
          <ul className="space-y-2">
            {list.map((t) => <QuestItem key={t.id} task={withKids(t)} today={today} extra={<PullButton id={t.id} title={t.title} day={today} />} />)}
          </ul>
        )}
      </>
    );
  }

  if (view === "weekly") {
    const long = open.filter((t) => ["weekly", "boss", "challenge"].includes(t.quest_type) && !t.parent_id);
    const group = (type: string, title: string, hint: string) => {
      const list = long.filter((t) => t.quest_type === type).sort((a, b) => (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1);
      return list.length ? <Section key={type} title={title} hint={hint}><ul className="space-y-2">{list.map((t) => <QuestItem key={t.id} task={withKids(t)} today={today} />)}</ul></Section> : null;
    };
    const subs = open.filter((t) => t.parent_id);
    return (
      <>
        <PageHeader title="Weekly, Boss & Challenges" subtitle="The bigger targets your daily quests feed into." />
        {tabs}
        {long.length === 0 && <EmptyState icon="trophy" title="No big targets yet">Create a Weekly, Boss or Challenge quest from the + menu under “More options → Type”.</EmptyState>}
        {group("weekly", "Weekly targets", "Meaningful goals for this week.")}
        {group("boss", "Boss Quests", "Difficult milestones. Break them into steps.")}
        {group("challenge", "Personal challenges", "Your own goals, with deadlines.")}
        {subs.length > 0 && (
          <Section title="Steps toward Boss Quests" hint="Finish these to unlock the Boss Quest itself.">
            <ul className="space-y-2">{subs.map((t) => <QuestItem key={t.id} task={withKids(t)} today={today} />)}</ul>
          </Section>
        )}
        {long.some((t) => t.due_date) && <p className="text-xs text-muted">Deadlines shown are yours to set; missing one never removes XP.</p>}
      </>
    );
  }

  if (view === "repeating") {
    return (
      <>
        <PageHeader title="Repeating quests" subtitle="Habits and routines. Each day becomes its own quest for the next two weeks." />
        {tabs}
        {templates.length === 0 ? <EmptyState icon="repeat" title="No repeating quests">Choose “Repeat” when you create a quest to build a habit.</EmptyState> : (
          <ul className="space-y-2">{templates.map((t) => <QuestItem key={t.id} task={t} today={today} />)}</ul>
        )}
      </>
    );
  }

  // completed collection
  const from = addDays(today, -30);
  const done = await getCompletions(ctx, from, today);
  const byDay = new Map<string, typeof done>();
  for (const d of done) { byDay.set(d.completed_on, [...(byDay.get(d.completed_on) ?? []), d]); }
  return (
    <>
      <PageHeader title="Completed quests" subtitle={`Your last 30 days: ${done.length} quests, ${done.reduce((a, d) => a + d.xp_awarded, 0)} XP.`} />
      {tabs}
      {done.length === 0 ? <EmptyState icon="trophy" title="No completed quests yet">Finish one and it shows up here.</EmptyState> : [...byDay].map(([day, list]) => (
        <Section key={day} title={relativeDay(day, today)} hint={`${list.length} done · ${list.reduce((a, d) => a + d.xp_awarded, 0)} XP`}>
          <ul className="space-y-2">
            {list.filter((d) => d.tasks).map((d) => <QuestItem key={d.id} doneXp={d.xp_awarded} today={today} task={{ ...(d.tasks as unknown as Task), status: "done", category: d.category, verify: null, recurrence: null, notes: null, description: null, subcategory: null, priority: 2, scheduled_time: null, due_date: null, sort_order: 0, template_id: null, subject_id: null, project_id: null }} />)}
          </ul>
        </Section>
      ))}
    </>
  );
}
