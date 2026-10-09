import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Sparkline } from "@/components/charts-lite";
import { Icon } from "@/components/icon";
import { QuestItem, type QuestView } from "@/components/quest-item";
import { DomainIcon, EmptyState, ProgressBar, Section, Stat } from "@/components/ui";
import { XpBar } from "@/components/xp-bar";
import { CATEGORIES, CATEGORY_KEYS, DIFFICULTY_LABEL } from "@/lib/constants";
import { addDays, diffDays, formatDay, formatTimestamp, relativeDay } from "@/lib/dates";
import { sumXpByCategory, xpSeries } from "@/lib/game/analytics";
import { availableMinutes, bucketTasks, dayLoad, nextBestActions } from "@/lib/game/planner";
import { consistency, weeklyStreak } from "@/lib/game/streaks";
import { buildCharacter } from "@/lib/game/xp";
import { getContext, getProgress } from "@/lib/server/context";
import { getActiveDates, getCompletions, getEvents, getOpenTasks, getRestDates, getUpcomingExams, getXpRows } from "@/lib/server/queries";
import { ensureRecurring } from "@/lib/server/recurring";
import type { ActivityEvent, Task } from "@/lib/types";

export const metadata = { title: "Character" };

const EVENT_ICON: Record<ActivityEvent["kind"], string> = { quest_done: "circle-check", level_up: "star", achievement: "trophy", reward: "gift" };

export default async function Dashboard() {
  const ctx = await getContext();
  const { supabase, today, profile, settings, curves } = ctx;
  await ensureRecurring(supabase, today);
  const from60 = addDays(today, -60);

  const [progress, open, doneToday, events, xpRows, activeDates, restDates, exams] = await Promise.all([
    getProgress(), getOpenTasks(ctx), getCompletions(ctx, today, today), getEvents(ctx, 8),
    getXpRows(ctx, addDays(today, -13), today), getActiveDates(ctx, from60), getRestDates(ctx, from60), getUpcomingExams(ctx, today),
  ]);

  const character = buildCharacter(progress.xp_by_category, curves.overall, curves.category);
  const o = character.overall;
  const weekXp = sumXpByCategory(xpRows, addDays(today, -6), today);
  const series = xpSeries(xpRows, addDays(today, -13), today);
  const flat = open.filter((t) => !t.parent_id || t.scheduled_date);
  const b = bucketTasks(flat, today);
  const plannedToday = b.today.length + doneToday.length;
  const pctToday = plannedToday ? Math.round((doneToday.length / plannedToday) * 100) : null;
  const week = consistency({ activeDates, restDates, restWeekdays: settings.rest_weekdays, today, days: 7 });
  const wk = weeklyStreak({ activeDates, restDates, today, weekStartsOn: settings.week_starts_on, minDays: 4 });
  const activeToday = activeDates.includes(today);
  const free = availableMinutes(today, settings);
  const doneMin = doneToday.reduce((a, d) => a + (d.tasks?.est_minutes ?? 0), 0);

  const { data: kids } = await supabase.from("tasks").select("parent_id").eq("status", "open").not("parent_id", "is", null);
  const openChildren = new Set((kids ?? []).map((k) => k.parent_id as string));
  const recs = nextBestActions(flat, { today, minutesLeft: free ? Math.max(0, free - doneMin) : null, exams, recentXp: weekXp, openChildren }, 3);
  const [best, ...alts] = recs;
  const nextExam = exams[0];
  const load = dayLoad(b.today, today);
  const asView = (t: Task): QuestView => t;

  return (
    <>
      {/* ───────── character ───────── */}
      <section className="card mb-5 p-5 sm:p-6" aria-label="Your character">
        <div className="flex items-start gap-4">
          <Avatar avatar={profile.avatar} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h1 className="truncate text-xl font-semibold sm:text-2xl">{profile.character_name}</h1>
              <span className="text-sm text-muted">{profile.active_title ?? "Rookie"}</span>
            </div>
            <div className="mt-2 flex items-end gap-3">
              <div className="num text-5xl font-bold leading-none text-accent" aria-label={`Level ${o.level}`}>{o.level}</div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>Level {o.level}</span>
                  <span><span className="num text-ink">{o.into}</span> / <span className="num">{o.needed}</span> XP</span>
                </div>
                <XpBar value={o.pct} label="XP toward next level" storageKey="lu:xp" xp={character.totalXp} />
                <div className="mt-1 text-[11px] text-faint"><span className="num">{o.remaining}</span> XP to level {o.level + 1} · {character.totalXp} total</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Today" value={<>{doneToday.length}<span className="text-base font-medium text-muted">/{plannedToday}</span></>} sub={pctToday != null ? `${pctToday}% complete` : "nothing planned"} />
          <Stat label="Streak" value={<span className="inline-flex items-center gap-1.5"><Icon name="flame" size={20} className={activeToday || progress.current_streak ? "text-accent" : "text-faint"} />{progress.current_streak}</span>}
            sub={`best ${progress.best_streak}${progress.current_streak > 0 && !activeToday ? " · do one quest to keep it" : ""}`} />
          <Stat label="Week consistency" value={`${Math.round(week.pct * 100)}%`} sub={`${week.kept}/7 days kept`} />
          <Stat label="Weekly streak" value={wk.current} sub={`${wk.thisWeekDays}/4 days this week`} />
        </div>
      </section>

      {/* ───────── next best action ───────── */}
      <Section title="Next best action" hint="One thing worth doing now, and why.">
        {best ? (
          <div className="card p-4 sm:p-5" data-testid="nba">
            <ul><QuestItem task={asView(best.task)} today={today} /></ul>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {best.reasons.length ? best.reasons.map((r) => <li key={r} className="inline-flex items-center gap-1.5"><Icon name="lightbulb" size={14} className="text-accent" />{r}</li>) : <li>Next in your plan.</li>}
            </ul>
            {alts.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">Or</div>
                <ul className="space-y-1.5">
                  {alts.map((a) => <li key={a.task.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{a.task.title}</span><span className="shrink-0 text-xs text-muted">{a.reasons[0] ?? DIFFICULTY_LABEL[a.task.difficulty]}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="sparkles" title={doneToday.length ? "You're clear for now" : "No quests yet"}
            action={<Link className="btn btn-primary btn-sm" href="/quests"><Icon name="list-todo" size={14} /> Open quest board</Link>}>
            {doneToday.length ? "Everything planned is done. Rest, or add something small." : "Use the + button to add your first quest. Presets for every area are one tap away."}
          </EmptyState>
        )}
      </Section>

      {/* ───────── attributes ───────── */}
      <Section title="Attributes" hint="Each area levels up on its own from the quests you complete there.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CATEGORY_KEYS.map((k) => {
            const c = character.categories[k];
            const v = series.map((p) => p[k]);
            return (
              <Link key={k} href={CATEGORIES[k].href} className="card block p-4 transition-colors hover:border-faint" data-testid={`attr-${k}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <DomainIcon category={k} size={20} />
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{CATEGORIES[k].attribute}</div>
                      <div className="-mt-0.5 text-sm font-semibold">{CATEGORIES[k].name}</div>
                    </div>
                  </div>
                  <div className="num text-2xl font-bold" aria-label={`Level ${c.level}`}>{c.level}</div>
                </div>
                <div className="mt-3"><XpBar value={c.pct} color={`var(--c-${k})`} label={`${CATEGORIES[k].name} progress`} /></div>
                <div className="mt-2 flex items-end justify-between gap-3 text-xs text-muted">
                  <div><span className="num text-ink">{c.into}</span>/<span className="num">{c.needed}</span> XP · {weekXp[k] > 0 ? <span className="text-ink">+{weekXp[k]} this week</span> : "no XP this week"}</div>
                  <Sparkline values={v} category={k} width={84} height={26} label={`${CATEGORIES[k].name} XP, last 14 days`} />
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Section title="Today's quests" actions={<Link className="text-sm text-muted hover:text-ink" href="/quests">All quests →</Link>}>
            {b.overdue.length > 0 && <p className="mb-2 text-xs text-warn">{b.overdue.length} carried over from earlier. Nothing is lost.</p>}
            {b.today.length + b.overdue.length === 0 ? (
              <EmptyState icon="circle-check" title={doneToday.length ? "All done for today" : "Nothing planned today"} action={<Link className="btn btn-sm" href="/quests?view=backlog">Browse backlog</Link>} />
            ) : (
              <ul className="space-y-2">{[...b.overdue.slice(0, 2), ...b.today].slice(0, 7).map((t) => <QuestItem key={t.id} task={asView(t)} today={today} />)}</ul>
            )}
            {load.count > 0 && <p className="mt-2 text-xs text-muted">{load.count} open · {load.minutes} min planned of ≈{Math.round(free * 0.8)} min realistic.</p>}
          </Section>
          {b.upcoming.length > 0 && (
            <Section title="Coming up">
              <ul className="space-y-1.5">
                {b.upcoming.slice(0, 4).map((t) => <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm"><span className="min-w-0 truncate">{t.title}</span><span className="shrink-0 text-xs text-muted">{relativeDay(t.scheduled_date!, today)}</span></li>)}
              </ul>
            </Section>
          )}
        </div>
        <div className="lg:col-span-2">
          {nextExam && (
            <Section title="Next exam">
              <Link href="/college" className="card-inset flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0"><div className="truncate text-sm font-semibold">{nextExam.title}</div><div className="text-xs text-muted">{formatDay(nextExam.exam_date)}</div></div>
                <div className="num shrink-0 text-right"><div className="text-2xl font-bold">{diffDays(today, nextExam.exam_date)}</div><div className="-mt-1 text-[11px] text-muted">days</div></div>
              </Link>
            </Section>
          )}
          <Section title="Recent activity">
            {events.length === 0 ? <p className="text-sm text-muted">Your XP gains, level-ups and badges will appear here.</p> : (
              <ul className="space-y-1" data-testid="feed">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
                    <Icon name={EVENT_ICON[e.kind]} size={16} className={`mt-0.5 shrink-0 ${e.kind === "quest_done" ? "text-muted" : "text-accent"}`} />
                    <span className="min-w-0 flex-1">{e.kind === "achievement" ? <>Badge: <b>{e.title}</b></> : e.title}{e.kind === "quest_done" && typeof e.detail?.xp === "number" && <span className="num ml-1.5 text-accent">+{e.detail.xp as number} XP</span>}</span>
                    <time className="shrink-0 text-xs text-faint" dateTime={e.created_at}>{formatTimestamp(e.created_at, profile.timezone)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
