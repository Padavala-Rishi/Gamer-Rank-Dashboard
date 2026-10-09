import Link from "next/link";
import { AchievementList } from "@/components/achievement-list";
import { ChartFrame, SimpleBars } from "@/components/charts";
import { DomainHeader, SubTabs } from "@/components/domain-header";
import { FocusTimer } from "@/components/focus-timer";
import { Icon } from "@/components/icon";
import { QuestItem } from "@/components/quest-item";
import { ResourceButton } from "@/components/resource-form";
import { EmptyState, Notice, ProgressBar, Section, Stat } from "@/components/ui";
import { addDays, diffDays, eachDay, formatDay, formatMinutes, weekStart } from "@/lib/dates";
import { sumXpByCategory } from "@/lib/game/analytics";
import { revisionsDue, syllabusProgress, type SyllabusNode } from "@/lib/game/domain";
import { buildCharacter } from "@/lib/game/xp";
import { examFields, subjectFields, syllabusFields } from "@/lib/forms";
import { getContext, getProgress } from "@/lib/server/context";
import { getXpRows } from "@/lib/server/queries";
import type { AchievementDef, Exam, FocusSession, Subject, SyllabusNodeRow, Task } from "@/lib/types";
import { DeleteSession, NodeStatus, ReviseButton } from "./client";

export const metadata = { title: "College" };
const TABS = [["overview", "Overview"], ["focus", "Focus timer"], ["syllabus", "Syllabus"], ["exams", "Exams"], ["progress", "Progress"]] as const;

export default async function College({ searchParams }: { searchParams: Promise<{ tab?: string; subject?: string }> }) {
  const ctx = await getContext();
  const { supabase, today, settings, curves, profile } = ctx;
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview";
  const ws = weekStart(today, settings.week_starts_on);

  const [progress, xpRows, subjects, nodes, exams, sessions, quests, defs, unlockedRows] = await Promise.all([
    getProgress(), getXpRows(ctx, addDays(today, -6), today),
    supabase.from("subjects").select("*").eq("archived", false).order("name").then((r) => (r.data ?? []) as Subject[]),
    supabase.from("syllabus_nodes").select("*").order("sort_order").then((r) => (r.data ?? []) as SyllabusNodeRow[]),
    supabase.from("exams").select("*").order("exam_date").then((r) => (r.data ?? []) as Exam[]),
    supabase.from("focus_sessions").select("*").eq("category", "college").gte("session_date", addDays(today, -60)).order("session_date", { ascending: false }).order("started_at", { ascending: false }).then((r) => (r.data ?? []) as FocusSession[]),
    supabase.from("tasks").select("*").eq("status", "open").eq("category", "college").order("scheduled_date", { nullsFirst: false }).limit(40).then((r) => (r.data ?? []) as Task[]),
    supabase.from("achievement_defs").select("*").eq("category", "college").order("sort").then((r) => (r.data ?? []) as AchievementDef[]),
    supabase.from("user_achievements").select("key,unlocked_at"),
  ]);
  const unlocked = new Map((unlockedRows.data ?? []).map((u) => [u.key as string, u.unlocked_at as string]));
  const character = buildCharacter(progress.xp_by_category, curves.overall, curves.category);
  const week = sumXpByCategory(xpRows, addDays(today, -6), today);
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const nodesOf = (sid: string) => nodes.filter((n) => n.subject_id === sid) as unknown as SyllabusNode[];
  const weekMin = (sid?: string) => sessions.filter((s) => s.session_date >= ws && (sid ? s.subject_id === sid : true)).reduce((a, s) => a + s.minutes, 0);
  const upcoming = exams.filter((e) => e.status === "upcoming" && e.exam_date >= today);
  const due = revisionsDue(nodes as unknown as SyllabusNode[], today);
  const header = <DomainHeader category="college" level={character.categories.college} weekXp={week.college} goal={settings.goals?.college?.goal} />;
  const studyTarget = settings.targets.study_weekly_min;
  const tz = profile.timezone;

  if (tab === "overview") {
    return (
      <>
        {header}
        <SubTabs base="/college" tabs={TABS} current={tab} />
        <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
          <Stat label="Focused this week" value={formatMinutes(weekMin())} sub={studyTarget ? `of ${formatMinutes(studyTarget)} target · recorded` : "recorded time"} />
          <Stat label="Next exam" value={upcoming[0] ? `${diffDays(today, upcoming[0].exam_date)} days` : "—"} sub={upcoming[0]?.title ?? "none scheduled"} />
          <Stat label="Revisions due" value={due.length} sub={due.length ? "spaced reviews waiting" : "all caught up"} />
        </div>
        {studyTarget > 0 && <div className="mb-6"><ProgressBar value={weekMin() / studyTarget} color="var(--c-college)" label="Weekly study target" /></div>}

        {due.length > 0 && (
          <Section title="Revision reminders" hint="Reviewing on a spaced schedule (1, 3, 7, 14, 30 days) makes it stick.">
            <ul className="space-y-1.5">
              {due.slice(0, 6).map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
                  <span className="min-w-0"><b className="font-medium">{n.title}</b> <span className="text-muted">· {subjectName.get(n.subject_id)}</span></span>
                  <ReviseButton id={n.id} title={n.title} due />
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Subjects" actions={<ResourceButton resource="subjects" title="Add subject" fields={subjectFields} className="btn btn-primary btn-sm" />}>
          {subjects.length === 0 ? <EmptyState icon="graduation-cap" title="Add your subjects" action={<ResourceButton resource="subjects" title="Add subject" fields={subjectFields} className="btn btn-primary btn-sm" />}>Then build each syllabus (units, topics, subtopics), add exam dates and start tracking focused time.</EmptyState> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {subjects.map((s) => {
                const p = syllabusProgress(nodesOf(s.id));
                const ex = upcoming.find((e) => e.subject_id === s.id);
                const min = weekMin(s.id);
                return (
                  <div key={s.id} className="card p-4" data-testid="subject-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="font-semibold">{s.name} {s.is_sample && <span className="badge ml-1">Sample</span>}</div><div className="text-xs text-muted">{s.code ?? "No code"}</div></div>
                      <ResourceButton resource="subjects" title={s.name} fields={subjectFields} initial={s as unknown as Record<string, unknown>} id={s.id} />
                    </div>
                    <div className="mt-3 space-y-2.5 text-xs text-muted">
                      <div><div className="mb-1 flex justify-between"><span>Syllabus</span><span className="num text-ink">{p.total ? `${p.done}/${p.total} topics` : "not set up"}</span></div><ProgressBar value={p.pct ?? 0} color="var(--c-college)" small label={`${s.name} syllabus progress`} /></div>
                      <div><div className="mb-1 flex justify-between"><span>This week</span><span className="num text-ink">{formatMinutes(min)} / {formatMinutes(s.weekly_target_min)}</span></div><ProgressBar value={s.weekly_target_min ? min / s.weekly_target_min : 0} small label={`${s.name} weekly study`} /></div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted">{ex ? <><Icon name="flag" size={12} className="mr-1 inline text-warn" />{ex.title} in <b className="num text-ink">{diffDays(today, ex.exam_date)}</b> days</> : "No exam scheduled"}</span>
                      <Link className="font-semibold text-accent" href={`/college?tab=syllabus&subject=${s.id}`}>Syllabus →</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
        <Section title="College quests" hint="Complete them to earn Knowledge XP.">
          {quests.length ? <ul className="space-y-2">{quests.slice(0, 8).map((t) => <QuestItem key={t.id} task={t} today={today} hideDomain />)}</ul> : <EmptyState icon="list-todo" title="No open college quests">Use “Add quest”. “Study one topic for 45 minutes” is a good start.</EmptyState>}
        </Section>
      </>
    );
  }

  if (tab === "focus") {
    const bySubject = subjects.map((s) => ({ s, min: weekMin(s.id) })).filter((x) => x.min > 0);
    return (
      <>
        {header}
        <SubTabs base="/college" tabs={TABS} current={tab} />
        <FocusTimer category="college" tz={tz} config={settings.pomodoro} subjects={subjects.map((s) => ({ id: s.id, name: s.name }))} tasks={quests.map((t) => ({ id: t.id, name: t.title }))} />
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Section title="Focused time this week" hint="Recorded sessions only.">
            {bySubject.length === 0 ? <p className="text-sm text-muted">Finish a focus block and it appears here, per subject.</p> : (
              <ul className="space-y-2">{bySubject.map(({ s, min }) => <li key={s.id}><div className="mb-1 flex justify-between text-sm"><span>{s.name}</span><span className="num text-muted">{formatMinutes(min)}</span></div><ProgressBar value={s.weekly_target_min ? min / s.weekly_target_min : 0} color="var(--c-college)" small label={`${s.name} focused time`} /></li>)}</ul>
            )}
          </Section>
          <Section title="Recent sessions">
            {sessions.length === 0 ? <p className="text-sm text-muted">No sessions yet.</p> : (
              <ul className="space-y-1.5">
                {sessions.slice(0, 8).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm" data-testid="focus-session">
                    <span className="min-w-0"><b>{formatMinutes(s.minutes)}</b> <span className="text-muted">· {s.subject_id ? subjectName.get(s.subject_id) ?? "Subject" : "No subject"} · {formatDay(s.session_date)}{s.mode === "pomodoro" ? " · pomodoro" : ""}</span></span>
                    <DeleteSession id={s.id} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </>
    );
  }

  if (tab === "syllabus") {
    const sid = subjects.find((s) => s.id === sp.subject)?.id ?? subjects[0]?.id;
    const subject = subjects.find((s) => s.id === sid);
    const list = sid ? (nodes.filter((n) => n.subject_id === sid)) : [];
    const kids = (pid: string | null) => list.filter((n) => n.parent_id === pid);
    const parents = list.filter((n) => n.kind !== "subtopic").map((n) => ({ value: n.id, label: n.title }));
    const renderNode = (n: SyllabusNodeRow, depth: number): React.ReactNode => {
      const ch = kids(n.id);
      const isLeaf = ch.length === 0;
      const sub = syllabusProgress(nodesOfTree(list, n.id));
      const dueNow = n.status === "done" && n.next_revision_on && n.next_revision_on <= today;
      return (
        <li key={n.id}>
          <div className={`flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 ${n.kind === "unit" ? "bg-raised/50" : ""}`} style={{ marginLeft: depth * 16 }} data-testid="syllabus-node">
            {isLeaf ? <NodeStatus id={n.id} status={n.status} title={n.title} /> : <span className="grid size-6 shrink-0 place-items-center text-faint"><Icon name="layers" size={15} /></span>}
            <div className="min-w-0 flex-1">
              <div className={`text-sm ${n.kind === "unit" ? "font-semibold" : "font-medium"} ${isLeaf && n.status === "done" ? "text-muted" : ""}`}>{n.title}</div>
              <div className="text-xs text-muted">
                {!isLeaf && <>{sub.done}/{sub.total} done · </>}
                {isLeaf && n.status === "done" && n.revision_count > 0 && <>revised {n.revision_count}× · </>}
                {isLeaf && n.status === "done" && n.next_revision_on && <span className={dueNow ? "text-warn" : ""}>{dueNow ? "revision due" : `next review ${formatDay(n.next_revision_on)}`}</span>}
              </div>
            </div>
            {isLeaf && n.status === "done" && dueNow && <ReviseButton id={n.id} title={n.title} due />}
            {n.kind !== "subtopic" && <ResourceButton resource="syllabus_nodes" title="Add inside" fields={syllabusFields(sid!, parents).map((f) => (f.name === "parent_id" ? { ...f, defaultValue: n.id } : f))} iconOnly icon="plus" />}
            <ResourceButton resource="syllabus_nodes" title={n.title} fields={syllabusFields(sid!, parents)} initial={n as unknown as Record<string, unknown>} id={n.id} />
          </div>
          {ch.length > 0 && <ul className="mt-1.5 space-y-1.5">{ch.map((c) => renderNode(c, depth + 1))}</ul>}
        </li>
      );
    };
    return (
      <>
        {header}
        <SubTabs base="/college" tabs={TABS} current={tab} />
        {subjects.length === 0 ? <EmptyState icon="graduation-cap" title="Add a subject first" action={<ResourceButton resource="subjects" title="Add subject" fields={subjectFields} className="btn btn-primary btn-sm" />} /> : (
          <>
            <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scroll-hide" role="tablist" aria-label="Subjects">
              {subjects.map((s) => <Link key={s.id} role="tab" aria-selected={s.id === sid} href={`/college?tab=syllabus&subject=${s.id}`} className="chip shrink-0" data-active={s.id === sid}>{s.name}</Link>)}
            </div>
            {subject && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted">{(() => { const p = syllabusProgress(list as unknown as SyllabusNode[]); return p.total ? `${p.done} of ${p.total} topics done (${Math.round((p.pct ?? 0) * 100)}%) · ${p.revised} revised` : "Build the syllabus: units, then topics and subtopics."; })()}</div>
                <ResourceButton resource="syllabus_nodes" title="Add unit / topic" fields={syllabusFields(sid!, parents)} className="btn btn-primary btn-sm" />
              </div>
            )}
            {list.length === 0 ? <EmptyState icon="book-open-check" title="No syllabus items yet">Add units first (e.g. “Unit 1 · Processes”), then topics inside them. Tap the circle to move a topic from not started to learning to done.</EmptyState> : <ul className="space-y-1.5">{kids(null).map((n) => renderNode(n, 0))}</ul>}
          </>
        )}
      </>
    );
  }

  if (tab === "exams") {
    const taken = exams.filter((e) => e.status === "taken" || e.exam_date < today);
    const opts = subjects.map((s) => ({ value: s.id, label: s.name }));
    return (
      <>
        {header}
        <SubTabs base="/college" tabs={TABS} current={tab} />
        <Section title="Upcoming exams" actions={<ResourceButton resource="exams" title="Add exam" fields={examFields(opts)} className="btn btn-primary btn-sm" />}>
          {upcoming.length === 0 ? <EmptyState icon="flag" title="No upcoming exams">Add exam dates and the planner will start prioritising the matching subject as they approach.</EmptyState> : (
            <ul className="space-y-2.5">
              {upcoming.map((e) => {
                const p = e.subject_id ? syllabusProgress(nodesOf(e.subject_id)) : null;
                const d = diffDays(today, e.exam_date);
                return (
                  <li key={e.id} className="card p-3.5" data-testid="exam">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="font-semibold">{e.title} {e.is_sample && <span className="badge ml-1">Sample</span>}</div><div className="text-xs text-muted">{e.subject_id ? subjectName.get(e.subject_id) : "No subject"} · {formatDay(e.exam_date)}{e.exam_time ? ` · ${e.exam_time.slice(0, 5)}` : ""}{e.weight_pct ? ` · ${e.weight_pct}% of grade` : ""}</div></div>
                      <div className="flex items-center gap-1"><div className="num text-right"><div className="text-2xl font-bold leading-none">{d}</div><div className="text-[11px] text-muted">{d === 1 ? "day" : "days"}</div></div><ResourceButton resource="exams" title={e.title} fields={examFields(opts)} initial={e as unknown as Record<string, unknown>} id={e.id} /></div>
                    </div>
                    {p && p.total > 0 && (
                      <div className="mt-3 text-xs text-muted"><div className="mb-1 flex justify-between"><span>Syllabus covered</span><span className="num text-ink">{p.done}/{p.total}</span></div><ProgressBar value={p.pct ?? 0} color="var(--c-college)" small label="Syllabus covered" />
                        {p.done < p.total && d > 0 && <p className="mt-1.5">Estimate: {Math.ceil((p.total - p.done) / d * 10) / 10} topics a day to finish in time.</p>}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        {taken.length > 0 && (
          <Section title="Past exams">
            <ul className="space-y-1.5">{taken.map((e) => <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm"><span><b>{e.title}</b> <span className="text-muted">· {formatDay(e.exam_date)}</span></span><span className="flex items-center gap-2"><span className="num">{e.score_pct != null ? `${e.score_pct}%` : "no score"}</span><ResourceButton resource="exams" title={e.title} fields={examFields(opts)} initial={e as unknown as Record<string, unknown>} id={e.id} /></span></li>)}</ul>
          </Section>
        )}
      </>
    );
  }

  // progress
  const days = eachDay(addDays(today, -29), today);
  const perDay = days.map((day) => ({ day, minutes: sessions.filter((s) => s.session_date === day).reduce((a, s) => a + s.minutes, 0) }));
  const perSubject = subjects.map((s) => ({ subject: s.name, minutes: sessions.filter((x) => x.subject_id === s.id && x.session_date >= addDays(today, -29)).reduce((a, x) => a + x.minutes, 0) }));
  return (
    <>
      {header}
      <SubTabs base="/college" tabs={TABS} current={tab} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Focused minutes per day" subtitle="Last 30 days · recorded sessions" empty={perDay.some((d) => d.minutes) ? null : "Finish a focus block to see your study rhythm."} table={{ columns: ["Day", "Minutes"], rows: perDay.map((d) => [d.day, d.minutes]) }}>
          <SimpleBars data={perDay} dataKey="minutes" label="Minutes" color="var(--c-college)" unit=" min" />
        </ChartFrame>
        <ChartFrame title="Focused minutes by subject" subtitle="Last 30 days" empty={perSubject.some((d) => d.minutes) ? null : "Pick a subject in the timer to see the split."} table={{ columns: ["Subject", "Minutes"], rows: perSubject.map((d) => [d.subject, d.minutes]) }}>
          <SimpleBars data={perSubject} xKey="subject" dataKey="minutes" label="Minutes" color="var(--c-college)" unit=" min" />
        </ChartFrame>
      </div>
      <Section title="Syllabus completion" className="mt-6">
        {subjects.length === 0 ? <p className="text-sm text-muted">Add subjects to track completion.</p> : (
          <ul className="space-y-3">{subjects.map((s) => { const p = syllabusProgress(nodesOf(s.id)); return <li key={s.id}><div className="mb-1 flex justify-between text-sm"><span>{s.name}</span><span className="num text-muted">{p.total ? `${p.done}/${p.total} · ${Math.round((p.pct ?? 0) * 100)}%` : "no syllabus"}</span></div><ProgressBar value={p.pct ?? 0} color="var(--c-college)" label={`${s.name} completion`} /></li>; })}</ul>
        )}
      </Section>
      <Section title="College achievements"><AchievementList defs={defs} unlocked={unlocked} metrics={progress.metrics} compact /></Section>
      <Notice>Every figure here comes from sessions and topics you recorded. Pace figures elsewhere are labelled “estimate”.</Notice>
    </>
  );
}

function nodesOfTree(list: SyllabusNodeRow[], rootId: string): SyllabusNode[] {
  const out: SyllabusNodeRow[] = [];
  const walk = (id: string) => { for (const n of list) if (n.parent_id === id) { out.push(n); walk(n.id); } };
  walk(rootId);
  return out as unknown as SyllabusNode[];
}
