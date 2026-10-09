import { AddQuestButton } from "@/components/add-button";
import { AchievementList } from "@/components/achievement-list";
import { ChartFrame, SimpleBars } from "@/components/charts";
import { DomainHeader, SubTabs } from "@/components/domain-header";
import { FocusTimer } from "@/components/focus-timer";
import { Icon } from "@/components/icon";
import { QuestItem } from "@/components/quest-item";
import { ResourceButton } from "@/components/resource-form";
import { EmptyState, Money, Notice, ProgressBar, Section, Stat } from "@/components/ui";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, PROJECT_STAGES, PROJECT_STAGE_LABEL, TRACKS } from "@/lib/constants";
import { addDays, eachDay, formatDay, formatMinutes, startOfMonth, weekStart, type YMD } from "@/lib/dates";
import { funnel, incomeSummary, sumXpByCategory } from "@/lib/game/analytics";
import { followUpsDue, trackProgress } from "@/lib/game/domain";
import { visibleNow } from "@/lib/game/planner";
import { buildCharacter } from "@/lib/game/xp";
import { invoiceFields, leadFields, outreachFields, paymentFields, projectFields, roadmapFields } from "@/lib/forms";
import { getContext, getProgress } from "@/lib/server/context";
import { getXpRows } from "@/lib/server/queries";
import type { AchievementDef, FocusSession, IncomeRecord, Lead, OutreachEntry, Project, RoadmapItemRow, Task } from "@/lib/types";
import { FeatureBump, LeadStatusSelect, RoadmapStatus, StageSelect } from "./client";

export const metadata = { title: "Development" };
const TABS = [["roadmap", "Roadmap"], ["projects", "Projects"], ["focus", "Coding log"], ["freelance", "Freelance"], ["revenue", "Revenue"], ["progress", "Progress"]] as const;

export default async function Dev({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await getContext();
  const { supabase, today, settings, curves, profile } = ctx;
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "roadmap";
  const ws = weekStart(today, settings.week_starts_on);

  const [progress, xpRows, items, projects, leads, outreach, money, sessions, quests, defs, unlockedRows] = await Promise.all([
    getProgress(), getXpRows(ctx, addDays(today, -6), today),
    supabase.from("roadmap_items").select("*").order("sort_order").order("created_at").then((r) => (r.data ?? []) as RoadmapItemRow[]),
    supabase.from("projects").select("*").order("created_at", { ascending: false }).then((r) => (r.data ?? []) as Project[]),
    supabase.from("freelance_leads").select("*").order("created_at", { ascending: false }).then((r) => (r.data ?? []) as Lead[]),
    supabase.from("outreach_log").select("*").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(300).then((r) => (r.data ?? []) as OutreachEntry[]),
    supabase.from("income_records").select("*").order("occurred_on", { ascending: false }).then((r) => (r.data ?? []) as IncomeRecord[]),
    supabase.from("focus_sessions").select("*").eq("category", "dev").gte("session_date", addDays(today, -90)).order("session_date", { ascending: false }).order("started_at", { ascending: false }).then((r) => (r.data ?? []) as FocusSession[]),
    supabase.from("tasks").select("*").eq("status", "open").eq("category", "dev").order("scheduled_date", { nullsFirst: false }).limit(80).then((r) => visibleNow((r.data ?? []) as Task[], today)),
    supabase.from("achievement_defs").select("*").eq("category", "dev").order("sort").then((r) => (r.data ?? []) as AchievementDef[]),
    supabase.from("user_achievements").select("key,unlocked_at"),
  ]);
  const unlocked = new Map((unlockedRows.data ?? []).map((u) => [u.key as string, u.unlocked_at as string]));
  const character = buildCharacter(progress.xp_by_category, curves.overall, curves.category);
  const week = sumXpByCategory(xpRows, addDays(today, -6), today);
  const weekMin = sessions.filter((s) => s.session_date >= ws).reduce((a, s) => a + s.minutes, 0);
  const codingTarget = settings.targets.coding_weekly_min;
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const header = <DomainHeader category="dev" level={character.categories.dev} weekXp={week.dev} goal={settings.goals?.dev?.goal} />;
  const cur = settings.currency;

  if (tab === "roadmap") {
    return (
      <>
        {header}
        <SubTabs base="/dev" tabs={TABS} current={tab} />
        <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
          <Stat label="Coding this week" value={formatMinutes(weekMin)} sub={codingTarget ? `of ${formatMinutes(codingTarget)} target · recorded` : "recorded time"} />
          <Stat label="Projects shipped" value={projects.filter((p) => ["deployed", "completed"].includes(p.stage)).length} sub={`${projects.length} in total`} />
          <Stat label="Milestones done" value={items.filter((i) => i.status === "done").length} sub={`of ${items.length}`} />
        </div>
        <Section title="Learning roadmap" hint="Ten tracks. Add your own milestones; learning hours are tracked separately from projects and income." actions={<ResourceButton resource="roadmap_items" title="Add milestone" fields={roadmapFields()} className="btn btn-primary btn-sm" />}>
          <div className="space-y-2.5">
            {TRACKS.map((t, idx) => {
              const list = items.filter((i) => i.track === t.key);
              const p = trackProgress(items, t.key);
              return (
                <details key={t.key} className="card group" open={idx === 0 || list.some((i) => i.status === "doing")} data-testid="track">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
                    <Icon name="chevron-right" size={16} className="text-faint transition-transform group-open:rotate-90" />
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{t.label}</div><div className="mt-1.5"><ProgressBar value={p.pct ?? 0} color="var(--c-dev)" small label={`${t.label} progress`} /></div></div>
                    <span className="num shrink-0 text-xs text-muted">{p.total ? `${p.done}/${p.total}` : "empty"}</span>
                  </summary>
                  <div className="space-y-1.5 border-t border-line px-3 pb-3 pt-2.5">
                    {list.length === 0 && <p className="px-1 text-sm text-muted">No milestones yet.</p>}
                    {list.map((i) => (
                      <div key={i.id} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5">
                        <RoadmapStatus id={i.id} status={i.status} title={i.title} />
                        <div className="min-w-0 flex-1"><div className={`text-sm ${i.status === "done" ? "text-muted line-through decoration-faint" : ""}`}>{i.title} {i.is_sample && <span className="badge ml-1">Sample</span>}</div>{i.resource_url && <a className="text-xs text-accent hover:underline" href={i.resource_url} target="_blank" rel="noopener noreferrer">Resource ↗</a>}</div>
                        <ResourceButton resource="roadmap_items" title={i.title} fields={roadmapFields(t.key)} initial={i as unknown as Record<string, unknown>} id={i.id} />
                      </div>
                    ))}
                    <ResourceButton resource="roadmap_items" title={`Add to ${t.label}`} label="Add milestone" fields={roadmapFields(t.key)} />
                  </div>
                </details>
              );
            })}
          </div>
        </Section>
        <Section title="Development quests" hint="Complete them to earn Career XP.">
          {quests.length ? <ul className="space-y-2">{quests.slice(0, 8).map((t) => <QuestItem key={t.id} task={t} today={today} hideDomain />)}</ul> : <EmptyState icon="list-todo" title="No open development quests">Use “Add quest”. “Push meaningful code to GitHub” is a good daily one.</EmptyState>}
        </Section>
      </>
    );
  }

  if (tab === "projects") {
    const skills = [...new Set(projects.flatMap((p) => p.skills))].sort();
    return (
      <>
        {header}
        <SubTabs base="/dev" tabs={TABS} current={tab} />
        <Section title="Projects" actions={<ResourceButton resource="projects" title="New project" fields={projectFields} className="btn btn-primary btn-sm" />}>
          {projects.length === 0 ? <EmptyState icon="rocket" title="No projects yet" action={<ResourceButton resource="projects" title="New project" fields={projectFields} className="btn btn-primary btn-sm" />}>Projects are your portfolio. Track them from planned to deployed, with repo and live links.</EmptyState> : (
            <div className="space-y-5">
              {PROJECT_STAGES.filter((s) => projects.some((p) => p.stage === s)).map((s) => (
                <div key={s}>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">{PROJECT_STAGE_LABEL[s]} · {projects.filter((p) => p.stage === s).length}</div>
                  <ul className="grid gap-2.5 sm:grid-cols-2">
                    {projects.filter((p) => p.stage === s).map((p) => (
                      <li key={p.id} className="card p-3.5" data-testid="project">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0"><div className="font-semibold">{p.name} {p.is_sample && <span className="badge ml-1">Sample</span>} {p.is_client_work && <span className="badge ml-1">Client</span>}</div>{p.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{p.description}</p>}</div>
                          <ResourceButton resource="projects" title={p.name} fields={projectFields} initial={p as unknown as Record<string, unknown>} id={p.id} />
                        </div>
                        {p.skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.skills.map((k) => <span key={k} className="badge">{k}</span>)}</div>}
                        {p.features_total > 0 && <div className="mt-3"><div className="mb-1 flex items-center justify-between text-xs text-muted"><span>Features</span><FeatureBump id={p.id} done={p.features_done} total={p.features_total} name={p.name} /></div><ProgressBar value={p.features_done / p.features_total} color="var(--c-dev)" small label={`${p.name} features`} /></div>}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <StageSelect id={p.id} stage={p.stage} name={p.name} />
                          <span className="flex gap-3 text-xs">{p.repo_url && <a className="inline-flex min-h-8 items-center px-1 text-accent hover:underline" href={p.repo_url} target="_blank" rel="noopener noreferrer">Repo ↗</a>}{p.live_url && <a className="inline-flex min-h-8 items-center px-1 text-accent hover:underline" href={p.live_url} target="_blank" rel="noopener noreferrer">Live ↗</a>}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>
        {skills.length > 0 && <Section title="Skills across projects" hint="Pulled from the skills you tag on each project."><div className="flex flex-wrap gap-1.5">{skills.map((k) => <span key={k} className="chip !cursor-default">{k}</span>)}</div></Section>}
      </>
    );
  }

  if (tab === "focus") {
    const days = eachDay(addDays(today, -29), today);
    const totalMin = sessions.reduce((a, s) => a + s.minutes, 0);
    return (
      <>
        {header}
        <SubTabs base="/dev" tabs={TABS} current={tab} />
        <FocusTimer category="dev" tz={profile.timezone} config={settings.pomodoro} projects={projects.filter((p) => p.stage !== "completed").map((p) => ({ id: p.id, name: p.name }))} tracks={TRACKS.map((t) => ({ key: t.key, label: t.label }))} tasks={quests.map((t) => ({ id: t.id, name: t.title }))} />
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ChartFrame title="Coding minutes per day" subtitle={`Last 30 days · ${formatMinutes(totalMin)} in 90 days · recorded`} empty={sessions.length ? null : "Finish a focus block to log coding time."} table={{ columns: ["Day", "Minutes"], rows: days.map((d) => [d, sessions.filter((s) => s.session_date === d).reduce((a, s) => a + s.minutes, 0)]) }}>
            <SimpleBars data={days.map((d) => ({ day: d, minutes: sessions.filter((s) => s.session_date === d).reduce((a, s) => a + s.minutes, 0) }))} dataKey="minutes" label="Minutes" color="var(--c-dev)" unit=" min" />
          </ChartFrame>
          <Section title="Recent sessions">
            {sessions.length === 0 ? <p className="text-sm text-muted">No sessions yet.</p> : <ul className="space-y-1.5">{sessions.slice(0, 8).map((s) => <li key={s.id} className="rounded-lg border border-line px-3 py-2 text-sm"><b>{formatMinutes(s.minutes)}</b> <span className="text-muted">· {s.project_id ? projectName.get(s.project_id) ?? "Project" : "No project"}{s.track ? ` · ${TRACKS.find((t) => t.key === s.track)?.label ?? s.track}` : ""} · {formatDay(s.session_date)}</span></li>)}</ul>}
          </Section>
        </div>
        <Notice className="mt-2">Coding hours are learning and building effort. They never count as income: money appears only when you record a real payment.</Notice>
      </>
    );
  }

  if (tab === "freelance") {
    const f = funnel(leads);
    const due = followUpsDue(leads, today);
    const live = leads.filter((l) => !["won", "lost"].includes(l.status));
    const closed = leads.filter((l) => ["won", "lost"].includes(l.status));
    const lastOutreach = new Map<string, OutreachEntry>();
    for (const o of outreach) if (!lastOutreach.has(o.lead_id)) lastOutreach.set(o.lead_id, o);
    const sent30 = outreach.filter((o) => ["message", "followup", "proposal"].includes(o.kind) && o.occurred_on >= addDays(today, -29)).length;
    const pct = (v: number | null) => (v == null ? "not enough data yet" : `${Math.round(v * 100)}%`);
    return (
      <>
        {header}
        <SubTabs base="/dev" tabs={TABS} current={tab} />
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Leads" value={f.total} sub={`${live.length} active`} />
          <Stat label="Outreach, 30 days" value={sent30} sub="messages, follow-ups, proposals" />
          <Stat label="Reply rate" value={f.replyRate == null ? "—" : pct(f.replyRate)} sub={f.replyRate == null ? "needs 5+ contacted" : `${f.replied} of ${f.contacted}`} />
          <Stat label="Won" value={f.won} sub={f.winRate == null ? "needs 3+ decided" : `${pct(f.winRate)} of decided`} />
        </div>
        {due.length > 0 && (
          <Section title="Follow-ups due" hint="A polite follow-up is often what turns a maybe into a yes.">
            <ul className="space-y-1.5">{due.map((l) => <li key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2.5 text-sm"><span><b>{l.name}</b> <span className="text-muted">· due {formatDay(l.next_followup_on!)}</span></span><AddQuestButton defaults={{ category: "dev", title: `Follow up with ${l.name}`, difficulty: "easy", est_minutes: 15, date: today }} label="Make it a quest" /></li>)}</ul>
          </Section>
        )}
        <Section title="Pipeline" actions={<ResourceButton resource="freelance_leads" title="New lead" fields={leadFields} className="btn btn-primary btn-sm" />}>
          {leads.length === 0 ? <EmptyState icon="handshake" title="No leads yet" action={<ResourceButton resource="freelance_leads" title="New lead" fields={leadFields} className="btn btn-primary btn-sm" />}>Track every person you contact: who, how, when you followed up, and what happened.</EmptyState> : (
            <ul className="space-y-2.5">
              {live.map((l) => <LeadCard key={l.id} l={l} last={lastOutreach.get(l.id)} today={today} />)}
              {closed.length > 0 && <li className="pt-2 text-xs font-semibold uppercase tracking-wider text-faint">Closed</li>}
              {closed.map((l) => <LeadCard key={l.id} l={l} last={lastOutreach.get(l.id)} today={today} />)}
            </ul>
          )}
        </Section>
        <Section title="Conversion funnel" hint="Counts only. Rates appear once there's enough data to mean something.">
          <ul className="grid gap-2 sm:grid-cols-2">{LEAD_STATUSES.map((s) => <li key={s} className="card-inset flex justify-between px-3 py-2 text-sm"><span>{LEAD_STATUS_LABEL[s]}</span><span className="num font-semibold">{leads.filter((l) => l.status === s).length}</span></li>)}</ul>
        </Section>
      </>
    );
  }

  if (tab === "revenue") {
    const monthStart: YMD = startOfMonth(today);
    const all = incomeSummary(money.map((m) => ({ ...m, amount: Number(m.amount) })));
    const mine = all.find((s) => s.currency === cur);
    const monthSum = incomeSummary(money.map((m) => ({ ...m, amount: Number(m.amount) })), monthStart, today);
    const monthMine = monthSum.find((s) => s.currency === cur)?.received ?? 0;
    const target = Number(settings.targets.income_monthly);
    const invoices = money.filter((m) => m.kind === "invoice");
    const paid = new Map<string, number>();
    for (const m of money) if (m.kind === "payment" && m.invoice_id) paid.set(m.invoice_id, (paid.get(m.invoice_id) ?? 0) + Number(m.amount));
    const payments = money.filter((m) => m.kind === "payment");
    const openInv = invoices.filter((i) => Number(i.amount) - (paid.get(i.id) ?? 0) > 0.0001);
    const leadOpts = leads.map((l) => ({ value: l.id, label: l.name }));
    const projOpts = projects.map((p) => ({ value: p.id, label: p.name }));
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(`${monthStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - (5 - i)); return d.toISOString().slice(0, 7); });
    const series = months.map((m) => ({ day: m, received: payments.filter((p) => p.currency === cur && p.occurred_on.slice(0, 7) === m).reduce((a, p) => a + Number(p.amount), 0) }));
    return (
      <>
        {header}
        <SubTabs base="/dev" tabs={TABS} current={tab} />
        <Notice className="mb-5">Only money you record counts. Hours of learning or coding are never converted into income here, and currencies are never mixed or converted.</Notice>
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Received this month" value={<Money amount={monthMine} currency={cur} />} sub={target ? <>target <Money amount={target} currency={cur} /></> : "no target set"} />
          <Stat label="Invoiced (all time)" value={<Money amount={mine?.invoiced ?? 0} currency={cur} />} />
          <Stat label="Received (all time)" value={<Money amount={mine?.received ?? 0} currency={cur} />} />
          <Stat label="Outstanding" value={<Money amount={mine?.outstanding ?? 0} currency={cur} />} sub={openInv.length ? `${openInv.length} unpaid invoice${openInv.length === 1 ? "" : "s"}` : "nothing owed"} />
        </div>
        {target > 0 && <div className="mb-6"><div className="mb-1 flex justify-between text-xs text-muted"><span>Monthly target</span><span className="num">{Math.round((monthMine / target) * 100)}%</span></div><ProgressBar value={monthMine / target} color="var(--c-dev)" label="Monthly income target" /></div>}
        {all.filter((s) => s.currency !== cur).length > 0 && (
          <Section title="Other currencies"><ul className="grid gap-2 sm:grid-cols-2">{all.filter((s) => s.currency !== cur).map((s) => <li key={s.currency} className="card-inset p-3 text-sm"><b>{s.currency}</b>: received <Money amount={s.received} currency={s.currency} />, outstanding <Money amount={s.outstanding} currency={s.currency} /></li>)}</ul></Section>
        )}
        <div className="mb-6 flex flex-wrap gap-2">
          <ResourceButton resource="income_records" title="Record a payment received" label="Record payment" fields={paymentFields(openInv.map((i) => ({ value: i.id, label: `${i.client ?? "Invoice"} · ${i.currency} ${Number(i.amount)} · ${i.occurred_on}` })), today, cur)} className="btn btn-primary btn-sm" />
          <ResourceButton resource="income_records" title="New invoice" fields={invoiceFields(leadOpts, projOpts, today, cur)} />
        </div>
        <ChartFrame title="Money received per month" subtitle={`${cur} · payments you recorded`} empty={series.some((s) => s.received > 0) ? null : "Record a real payment to see it here."} table={{ columns: ["Month", `Received (${cur})`], rows: series.map((s) => [s.day, s.received]) }}>
          <SimpleBars data={series} dataKey="received" label="Received" color="var(--c-dev)" target={target || undefined} />
        </ChartFrame>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Section title="Invoices">
            {invoices.length === 0 ? <p className="text-sm text-muted">No invoices recorded.</p> : (
              <ul className="space-y-1.5">{invoices.map((i) => { const left = Number(i.amount) - (paid.get(i.id) ?? 0); return (
                <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
                  <span className="min-w-0"><b>{i.client ?? "Invoice"}</b> <span className="text-muted">· {formatDay(i.occurred_on)}{i.due_on && left > 0 ? ` · due ${formatDay(i.due_on)}${i.due_on < today ? " (overdue)" : ""}` : ""}</span></span>
                  <span className="flex items-center gap-2 text-right"><span><Money amount={i.amount} currency={i.currency} /><br /><span className="text-xs text-muted">{left <= 0.0001 ? "paid" : <>owed <Money amount={left} currency={i.currency} /></>}</span></span><ResourceButton resource="income_records" title="invoice" fields={invoiceFields(leadOpts, projOpts, today, cur)} initial={i as unknown as Record<string, unknown>} id={i.id} /></span>
                </li>); })}</ul>
            )}
          </Section>
          <Section title="Payments received">
            {payments.length === 0 ? <p className="text-sm text-muted">No payments recorded yet.</p> : (
              <ul className="space-y-1.5">{payments.slice(0, 12).map((p) => <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm"><span className="min-w-0"><b>{p.client ?? "Payment"}</b> <span className="text-muted">· {formatDay(p.occurred_on)}</span></span><span className="flex items-center gap-2"><Money amount={p.amount} currency={p.currency} /><ResourceButton resource="income_records" title="payment" fields={paymentFields(openInv.map((i) => ({ value: i.id, label: `${i.client ?? "Invoice"} · ${i.currency} ${Number(i.amount)}` })), today, cur)} initial={p as unknown as Record<string, unknown>} id={p.id} /></span></li>)}</ul>
            )}
          </Section>
        </div>
      </>
    );
  }

  // progress
  const days = eachDay(addDays(today, -29), today);
  const perTrack = TRACKS.map((t) => ({ track: t.label.split(" ")[0], minutes: sessions.filter((s) => s.track === t.key).reduce((a, s) => a + s.minutes, 0) })).filter((x) => x.minutes > 0);
  const shipped = projects.filter((p) => ["deployed", "completed"].includes(p.stage));
  return (
    <>
      {header}
      <SubTabs base="/dev" tabs={TABS} current={tab} />
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Coding, 90 days" value={formatMinutes(sessions.reduce((a, s) => a + s.minutes, 0))} sub="recorded" />
        <Stat label="Projects shipped" value={shipped.length} />
        <Stat label="Outreach sent" value={outreach.filter((o) => ["message", "followup", "proposal"].includes(o.kind)).length} />
        <Stat label="Clients won" value={leads.filter((l) => l.status === "won").length} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Coding minutes per day" subtitle="Last 30 days · recorded" empty={sessions.length ? null : "Log focus sessions to see your rhythm."} table={{ columns: ["Day", "Minutes"], rows: days.map((x) => [x, sessions.filter((s) => s.session_date === x).reduce((a, s) => a + s.minutes, 0)]) }}>
          <SimpleBars data={days.map((x) => ({ day: x, minutes: sessions.filter((s) => s.session_date === x).reduce((a, s) => a + s.minutes, 0) }))} dataKey="minutes" label="Minutes" color="var(--c-dev)" unit=" min" />
        </ChartFrame>
        <ChartFrame title="Time by learning track" subtitle="90 days · sessions where you picked a track" empty={perTrack.length ? null : "Pick a learning track in the timer to see the split."} table={{ columns: ["Track", "Minutes"], rows: perTrack.map((x) => [x.track, x.minutes]) }}>
          <SimpleBars data={perTrack} xKey="track" dataKey="minutes" label="Minutes" color="var(--c-dev)" unit=" min" />
        </ChartFrame>
      </div>
      <Section title="Portfolio" className="mt-6" hint="Shipped projects with their links.">
        {shipped.length === 0 ? <p className="text-sm text-muted">Deploy a project and it shows up here.</p> : <ul className="space-y-1.5">{shipped.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 text-sm"><b>{p.name}</b><span className="flex gap-3 text-xs">{p.repo_url && <a className="inline-flex min-h-8 items-center px-1 text-accent hover:underline" href={p.repo_url} target="_blank" rel="noopener noreferrer">Repo ↗</a>}{p.live_url && <a className="inline-flex min-h-8 items-center px-1 text-accent hover:underline" href={p.live_url} target="_blank" rel="noopener noreferrer">Live ↗</a>}</span></li>)}</ul>}
      </Section>
      <Section title="Career achievements"><AchievementList defs={defs} unlocked={unlocked} metrics={progress.metrics} compact /></Section>
    </>
  );
}

function LeadCard({ l, last, today }: { l: Lead; last?: OutreachEntry; today: string }) {
  const overdue = l.next_followup_on && l.next_followup_on <= today && !["won", "lost"].includes(l.status);
  return (
    <li className="card p-3.5" data-testid="lead">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{l.name} {l.is_sample && <span className="badge ml-1">Sample</span>}</div>
          <div className="text-xs text-muted">{[l.company, l.channel].filter(Boolean).join(" · ") || "No details"}{l.expected_value ? <> · expect <Money amount={l.expected_value} currency={l.currency} /></> : null}</div>
        </div>
        <div className="flex items-center gap-1">
          <ResourceButton resource="outreach_log" title={`Log outreach to ${l.name}`} label="Log" fields={outreachFields(l.id).map((f) => (f.name === "occurred_on" ? { ...f, defaultValue: today } : f))} icon="send" />
          <ResourceButton resource="freelance_leads" title={l.name} fields={leadFields} initial={l as unknown as Record<string, unknown>} id={l.id} />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2"><LeadStatusSelect id={l.id} status={l.status} name={l.name} />
        {l.next_followup_on && !["won", "lost"].includes(l.status) && <span className={`text-xs ${overdue ? "text-warn" : "text-muted"}`}>Follow up {formatDay(l.next_followup_on)}</span>}
        {last && <span className="text-xs text-muted">Last: {last.kind} · {formatDay(last.occurred_on)}</span>}
      </div>
      {l.lost_reason && l.status === "lost" && <p className="mt-1.5 text-xs text-muted">Lost because: {l.lost_reason}</p>}
    </li>
  );
}
