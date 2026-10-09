import Link from "next/link";
import { AddQuestButton } from "@/components/add-button";
import { CapacityMeter } from "@/components/capacity";
import { Icon } from "@/components/icon";
import { QuestItem } from "@/components/quest-item";
import { EmptyState, PageHeader, Section } from "@/components/ui";
import { addDays, addMonths, daysInMonth, formatDay, formatMinutes, isYMD, isoWeekday, startOfMonth, weekStart, WEEKDAY_KEYS, type YMD } from "@/lib/dates";
import { availableMinutes, dayLoad } from "@/lib/game/planner";
import { getContext } from "@/lib/server/context";
import { ensureRecurring } from "@/lib/server/recurring";
import type { Exam, Task } from "@/lib/types";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  const { supabase, today, settings } = await getContext();
  await ensureRecurring(supabase, today);
  const sp = await searchParams;
  const selected: YMD = sp.day && isYMD(sp.day) ? sp.day : today;
  const monthStart = sp.month && isYMD(`${sp.month}-01`) ? (`${sp.month}-01` as YMD) : startOfMonth(selected);
  const startsOn = settings.week_starts_on;
  const gridStart = weekStart(monthStart, startsOn);
  const gridEnd = addDays(weekStart(addDays(monthStart, daysInMonth(monthStart) - 1), startsOn), 6);

  const [tasksRes, examsRes] = await Promise.all([
    supabase.from("tasks").select("*").in("status", ["open", "done", "skipped"]).gte("scheduled_date", gridStart).lte("scheduled_date", gridEnd).order("sort_order").order("priority"),
    supabase.from("exams").select("*").gte("exam_date", gridStart).lte("exam_date", gridEnd).order("exam_date"),
  ]);
  const tasks = (tasksRes.data ?? []) as Task[];
  const exams = (examsRes.data ?? []) as Exam[];

  const byDay = new Map<YMD, { open: number; done: number }>();
  for (const t of tasks) {
    const e = byDay.get(t.scheduled_date!) ?? { open: 0, done: 0 };
    if (t.status === "open") e.open++; else if (t.status === "done") e.done++;
    byDay.set(t.scheduled_date!, e);
  }
  const examDays = new Map<YMD, Exam[]>();
  for (const e of exams) examDays.set(e.exam_date, [...(examDays.get(e.exam_date) ?? []), e]);

  const cells: YMD[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d);
  const labels = startsOn === 1 ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const prev = addMonths(monthStart, -1).slice(0, 7), next = addMonths(monthStart, 1).slice(0, 7);
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthStart}T00:00:00Z`));

  const dayTasks = tasks.filter((t) => t.scheduled_date === selected);
  const load = dayLoad(dayTasks, selected);
  const free = availableMinutes(selected, settings);
  const iso = isoWeekday(selected);
  const blocks = (settings.commitments ?? []).filter((c) => c.days.includes(iso)).sort((a, b) => (a.start < b.start ? -1 : 1));
  const dayExams = examDays.get(selected) ?? [];
  const link = (m: string, d?: string) => `/calendar?month=${m}${d ? `&day=${d}` : ""}`;

  return (
    <>
      <PageHeader title="Calendar" subtitle="Plan the week and keep every day realistic." actions={<AddQuestButton defaults={{ date: selected }} label="Add to this day" className="btn btn-primary btn-sm" />} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="card p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{monthName}</h2>
              <div className="flex gap-1">
                <Link className="btn btn-ghost btn-icon btn-sm" href={link(prev)} aria-label="Previous month"><Icon name="chevron-left" size={18} /></Link>
                <Link className="btn btn-sm" href={link(today.slice(0, 7), today)}>Today</Link>
                <Link className="btn btn-ghost btn-icon btn-sm" href={link(next)} aria-label="Next month"><Icon name="chevron-right" size={18} /></Link>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-faint">
              {labels.map((l) => <div key={l} className="py-1">{l}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthName}>
              {cells.map((d) => {
                const inMonth = d.slice(0, 7) === monthStart.slice(0, 7);
                const c = byDay.get(d);
                const ex = examDays.get(d);
                const isSel = d === selected, isToday = d === today;
                const wd = WEEKDAY_KEYS[isoWeekday(d) - 1];
                const lowFree = (settings.availability?.[wd] ?? 0) === 0;
                return (
                  <Link key={d} href={link(monthStart.slice(0, 7), d)} role="gridcell" aria-selected={isSel} aria-label={`${formatDay(d, { weekday: "long", day: "numeric", month: "long" })}${c ? `, ${c.open} open, ${c.done} done` : ""}${ex ? ", exam" : ""}`}
                    className={`relative flex min-h-[3.6rem] flex-col items-center rounded-xl border p-1 text-sm transition-colors sm:min-h-[4.2rem] ${isSel ? "border-accent bg-accent/10" : "border-transparent hover:bg-raised"} ${inMonth ? "" : "opacity-35"}`}>
                    <span className={`num grid size-6 place-items-center rounded-full text-[13px] ${isToday ? "bg-accent font-bold text-accent-ink" : ""}`}>{Number(d.slice(8))}</span>
                    <span className="mt-auto flex items-center gap-1 pb-0.5">
                      {c && c.open > 0 && <span className="num rounded-full bg-accent/20 px-1.5 text-[10px] font-bold text-accent">{c.open}</span>}
                      {c && c.done > 0 && <span className="num rounded-full bg-raised px-1.5 text-[10px] font-semibold text-muted">✓{c.done}</span>}
                      {ex && <Icon name="flag" size={11} className="text-warn" />}
                      {lowFree && !c && <span className="size-1 rounded-full bg-faint/50" title="No free time set" />}
                    </span>
                  </Link>
                );
              })}
            </div>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span><span className="num mr-1 rounded-full bg-accent/20 px-1.5 text-[10px] font-bold text-accent">3</span>open</span>
              <span><span className="num mr-1 rounded-full bg-raised px-1.5 text-[10px] font-semibold">✓2</span>done</span>
              <span className="inline-flex items-center gap-1"><Icon name="flag" size={11} className="text-warn" />exam</span>
            </p>
          </div>
        </div>

        <div className="lg:col-span-2">
          <Section title={formatDay(selected, { weekday: "long", day: "numeric", month: "long" })} hint={selected === today ? "Today" : undefined}>
            <div className="card mb-3 p-3.5"><CapacityMeter load={load} free={free} limit={settings.daily_task_limit} /></div>
            {dayExams.map((e) => (
              <div key={e.id} className="mb-3 flex items-center gap-2.5 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-sm"><Icon name="flag" size={16} className="text-warn" /><span><b>{e.title}</b>{e.exam_time && ` · ${e.exam_time.slice(0, 5)}`}{e.location && ` · ${e.location}`}</span></div>
            ))}
            {blocks.length > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">Fixed commitments</div>
                <ul className="space-y-1">{blocks.map((b, i) => <li key={i} className="card-inset flex items-center justify-between px-3 py-2 text-sm"><span>{b.title}</span><span className="num text-xs text-muted">{b.start}–{b.end}</span></li>)}</ul>
              </div>
            )}
            {dayTasks.length === 0 ? (
              <EmptyState icon="calendar-days" title="Nothing planned" action={<AddQuestButton defaults={{ date: selected }} label="Plan something" />}>
                Free time here: ≈{formatMinutes(free)}. A realistic day uses about 80% of it.
              </EmptyState>
            ) : (
              <ul className="space-y-2">{dayTasks.map((t) => <QuestItem key={t.id} task={t} today={today} />)}</ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
