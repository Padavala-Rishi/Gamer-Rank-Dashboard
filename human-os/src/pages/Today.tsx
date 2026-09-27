import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, BookOpen, Brain, CalendarClock, CalendarPlus, Gift, HeartPulse, NotebookPen, Play, Plus, Repeat, Settings2, Target, Timer, Users, Zap } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useProfile, useTz } from "../lib/hooks";
import { fmtLongDate, fmtMin, fmtTimeInTz, greeting } from "../lib/format";
import type { Checkin, EventOccurrence, FocusSession, GoalView, HabitView, Task } from "../lib/types";
import { Button, Card, Empty, ErrorState, Modal, Progress, Skeleton } from "../components/ui";
import { TaskRow, GoalProgressLine } from "../components/entities";
import { CheckinForm, HabitDayControl, StreakBadge } from "../components/daily";
import { PlannerModal } from "../components/Planner";
import { NowContent } from "../layout/NowPanel";
import { useUI } from "../layout/UIContext";
import { DASHBOARD_WIDGETS, label } from "../../shared/constants";
import { EVENT_KINDS } from "../../shared/constants";
import { EVENT_COLOR } from "../lib/colors";

interface TodayData {
  date: string;
  now_min: number;
  day_progress: number;
  timezone: string;
  checkin: Checkin | null;
  mits: Task[];
  overdue: Task[];
  due_today: Task[];
  scheduled_today: Task[];
  events: EventOccurrence[];
  tomorrow_events: EventOccurrence[];
  habits: HabitView[];
  goals_attention: GoalView[];
  focus_goals: GoalView[];
  running_session: FocusSession | null;
  reflection_id: string | null;
  people_to_contact: { id: string; name: string; days: number }[];
  birthdays: { id: string; name: string; date: string; inDays: number }[];
  flashcards_due: number;
  snapshot: Record<string, number | null>;
}


export default function Today() {
  useDocumentTitle("Today");
  const q = useApi<TodayData>("/today", { refetchInterval: 5 * 60_000 });
  const profile = useProfile();
  const [params, setParams] = useSearchParams();
  const [planner, setPlanner] = useState<null | "today" | "tomorrow">(null);
  const [customize, setCustomize] = useState(false);
  const ui = useUI();

  useEffect(() => {
    const p = params.get("plan");
    if (p === "today" || p === "tomorrow") {
      setPlanner(p);
      params.delete("plan");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  if (q.isLoading)
    return (
      <div className="page">
        <Skeleton lines={10} height={20} />
      </div>
    );
  if (q.error || !q.data)
    return (
      <div className="page">
        <ErrorState error={q.error} retry={() => q.refetch()} />
      </div>
    );
  const d = q.data;
  const widgets = profile.data?.dashboard_widgets ?? DASHBOARD_WIDGETS.map((w) => w[0]);
  const name = profile.data?.display_name;
  const renderers: Record<string, ReactNode> = {
    now: <NowWidget key="now" />,
    priorities: <PrioritiesWidget key="priorities" d={d} onPlan={() => setPlanner("today")} />,
    schedule: <ScheduleWidget key="schedule" d={d} />,
    habits: <HabitsWidget key="habits" d={d} />,
    checkin: <CheckinWidget key="checkin" d={d} />,
    snapshot: <SnapshotWidget key="snapshot" d={d} />,
    goals: <GoalsWidget key="goals" d={d} />,
    focus: <FocusWidget key="focus" d={d} />,
    reflection: <ReflectionWidget key="reflection" d={d} />,
    people: <PeopleWidget key="people" d={d} />,
    learning: <LearningWidget key="learning" d={d} />,
  };
  const left = ["now", "priorities", "schedule", "goals", "reflection"];
  const leftCol = widgets.filter((w) => left.includes(w)).map((w) => renderers[w]);
  const rightCol = widgets.filter((w) => !left.includes(w)).map((w) => renderers[w]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted small">{fmtLongDate(d.date)}</p>
          <h1>
            {greeting(d.now_min)}
            {name ? `, ${name}` : ""}
          </h1>
          <div className="row mt-8" style={{ maxWidth: 360 }}>
            <div className="grow">
              <Progress value={d.day_progress} label="How much of your planned day has passed" />
            </div>
            <span className="small muted num">{Math.round(d.day_progress * 100)}% of your day</span>
          </div>
        </div>
        <div className="row wrap">
          <Button variant="ghost" icon onClick={() => setCustomize(true)} aria-label="Customise dashboard">
            <Settings2 size={16} />
          </Button>
          <Button onClick={() => setPlanner("today")}>
            <CalendarPlus size={16} aria-hidden /> Plan my day
          </Button>
          <Button variant="now" className="hide-mobile" onClick={ui.openNow}>
            <Zap size={16} aria-hidden /> What should I do now?
          </Button>
        </div>
      </header>
      <div className="dash">
        <div className="col" style={{ gap: "var(--space)" }}>
          {leftCol}
        </div>
        <div className="col" style={{ gap: "var(--space)" }}>
          {rightCol}
        </div>
      </div>
      <PlannerModal open={planner !== null} initialDate={planner ?? "today"} onClose={() => setPlanner(null)} />
      <CustomizeModal open={customize} onClose={() => setCustomize(false)} />
    </div>
  );
}

function NowWidget() {
  return (
    <Card title="What should I do now?" icon={<Zap size={16} aria-hidden />} className="accent now-card">
      <NowContent compact />
    </Card>
  );
}

function PrioritiesWidget({ d, onPlan }: { d: TodayData; onPlan: () => void }) {
  const ui = useUI();
  const seen = new Set<string>();
  const uniq = (ts: Task[]) => ts.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  const mits = uniq(d.mits);
  const overdue = uniq(d.overdue);
  const due = uniq(d.due_today);
  const scheduled = uniq(d.scheduled_today);
  const total = mits.length + overdue.length + due.length + scheduled.length;
  return (
    <Card
      title="Today's priorities"
      icon={<Target size={16} aria-hidden />}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => ui.openTask({ scheduled_date: d.date })} aria-label="Add task for today">
            <Plus size={15} />
          </Button>
          <Link to="/tasks" className="btn btn-sm btn-ghost">
            All tasks
          </Link>
        </>
      }
    >
      {total === 0 ? (
        <Empty icon={<Target size={20} />} title="No priorities set" action={<Button variant="primary" onClick={onPlan}>Plan my day</Button>}>
          Pick 1–3 things that would make today a good day.
        </Empty>
      ) : (
        <div className="col gap-12">
          {mits.length === 0 && (
            <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={onPlan}>
              Choose your most important tasks
            </button>
          )}
          {mits.length > 0 && <Group label="Most important">{mits.map((t) => <TaskRow key={t.id} task={t} />)}</Group>}
          {overdue.length > 0 && (
            <Group label={`Overdue (${overdue.length})`}>
              {overdue.slice(0, 5).map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
              {overdue.length > 5 && <Link to="/tasks?view=overdue" className="small">+{overdue.length - 5} more overdue</Link>}
            </Group>
          )}
          {due.length > 0 && <Group label="Due today">{due.map((t) => <TaskRow key={t.id} task={t} />)}</Group>}
          {scheduled.length > 0 && <Group label="Planned for today">{scheduled.map((t) => <TaskRow key={t.id} task={t} />)}</Group>}
        </div>
      )}
    </Card>
  );
}

function Group({ label: l, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="tiny muted strong" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {l}
      </div>
      <div className="list">{children}</div>
    </div>
  );
}

function ScheduleWidget({ d }: { d: TodayData }) {
  const tz = useTz();
  const nowIso = new Date().toISOString();
  const upcoming = d.events.filter((e) => e.end_at > nowIso || e.all_day);
  return (
    <Card title="Schedule" icon={<CalendarClock size={16} aria-hidden />} actions={<Link to="/calendar" className="btn btn-sm btn-ghost">Calendar</Link>}>
      {upcoming.length === 0 ? (
        <p className="muted small">Nothing else scheduled today.{d.tomorrow_events.length ? ` Tomorrow starts with “${d.tomorrow_events[0].title}” at ${fmtTimeInTz(d.tomorrow_events[0].start_at, tz)}.` : ""}</p>
      ) : (
        <div className="list">
          {upcoming.map((e) => {
            const current = e.start_at <= nowIso && e.end_at > nowIso;
            return (
              <div key={e.occurrence_key} className="item">
                <span className="num small" style={{ width: 92, color: current ? "var(--accent)" : "var(--ink-2)", fontWeight: current ? 600 : 400 }}>
                  {e.all_day ? "All day" : `${fmtTimeInTz(e.start_at, tz)}–${fmtTimeInTz(e.end_at, tz)}`}
                </span>
                <span className="dot" style={{ background: EVENT_COLOR[e.kind] ?? "#6b7280" }} aria-hidden />
                <span className="grow ellipsis">{e.title}</span>
                <span className="small muted hide-mobile">{label(EVENT_KINDS, e.kind)}</span>
                {current && <span className="badge accent">Now</span>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function HabitsWidget({ d }: { d: TodayData }) {
  return (
    <Card title="Habits" icon={<Repeat size={16} aria-hidden />} actions={<Link to="/habits" className="btn btn-sm btn-ghost">All</Link>}>
      {d.habits.length === 0 ? (
        <Empty icon={<Repeat size={20} />} title="No habits yet" action={<Link className="btn btn-sm" to="/habits?new=1">Add a habit</Link>}>
          Start with one small habit and a minimum version you can do on bad days.
        </Empty>
      ) : (
        <div className="list">
          {d.habits.map((h) => (
            <div key={h.id} className="item" style={{ flexWrap: "wrap" }}>
              <div className="grow">
                <div className="row gap-4">
                  <span className="item-title">{h.title}</span>
                  <StreakBadge habit={h} />
                </div>
                <div className="meta">
                  {h.frequency === "weekly" && h.stats.weekProgress && (
                    <span>
                      {h.stats.weekProgress.done}/{h.stats.weekProgress.target} this week
                    </span>
                  )}
                  {h.minimum_value != null && (
                    <span>
                      Min {h.minimum_value} · target {h.target_value ?? "—"} {h.unit ?? ""}
                    </span>
                  )}
                </div>
              </div>
              <HabitDayControl habit={h} date={d.date} compact />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CheckinWidget({ d }: { d: TodayData }) {
  const [editing, setEditing] = useState(false);
  const c = d.checkin;
  return (
    <Card title="Check-in" icon={<HeartPulse size={16} aria-hidden />} actions={c && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}>
      {!c ? (
        <div className="col gap-8">
          <p className="small muted">How are you, really? 30 seconds — the planner uses your energy to make realistic suggestions.</p>
          <Button variant="primary" onClick={() => setEditing(true)}>
            Check in
          </Button>
        </div>
      ) : (
        <div className="stats-row">
          <MiniStat label="Sleep" value={c.sleep_hours != null ? `${c.sleep_hours}h` : "—"} />
          <MiniStat label="Energy" value={c.energy != null ? `${c.energy}/5` : "—"} />
          <MiniStat label="Mood" value={c.mood != null ? `${c.mood}/5` : "—"} />
          <MiniStat label="Stress" value={c.stress != null ? `${c.stress}/5` : "—"} />
          {c.rest_day && <span className="badge accent">Rest day</span>}
        </div>
      )}
      {c && ((c.stress ?? 0) >= 4 || (c.energy ?? 5) <= 2) && (
        <p className="small mt-12 ink-2">
          <Brain size={13} aria-hidden /> A heavier day. Consider a lighter plan and a real break — and if this has lasted a while, talking to someone you trust or a professional can help.
        </p>
      )}
      <Modal open={editing} onClose={() => setEditing(false)} title="Daily check-in" wide>
        {editing && <CheckinForm existing={c} date={d.date} onDone={() => setEditing(false)} />}
      </Modal>
    </Card>
  );
}

function MiniStat({ label: l, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{l}</span>
      <span className="stat-value" style={{ fontSize: 18 }}>
        {value}
      </span>
    </div>
  );
}

function SnapshotWidget({ d }: { d: TodayData }) {
  const s = d.snapshot;
  const items: [string, ReactNode][] = [
    ["Tasks done", s.tasks_done],
    ["Important done", s.important_done],
    ["Deep work", fmtMin(s.focus_min)],
    ["Learning", fmtMin(s.study_min)],
    ["Habits", s.habits_scheduled ? `${s.habits_done}/${s.habits_scheduled}` : "—"],
    ["Exercise", s.exercise_min ? fmtMin(s.exercise_min) : "—"],
    ["Practice", s.practice_min ? fmtMin(s.practice_min) : "—"],
    ["Screen time", s.screen_min != null ? fmtMin(s.screen_min) : "—"],
    ["Distractions", s.distractions ?? 0],
  ];
  return (
    <Card title="Today so far" icon={<BookOpen size={16} aria-hidden />}>
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        {items.map(([l, v]) => (
          <MiniStat key={l} label={l} value={v ?? 0} />
        ))}
      </div>
      <p className="tiny muted mt-12">Separate dimensions on purpose — a day isn't a single score.</p>
    </Card>
  );
}

function GoalsWidget({ d }: { d: TodayData }) {
  const list = d.goals_attention.length ? d.goals_attention : d.focus_goals;
  return (
    <Card title={d.goals_attention.length ? "Goals needing attention" : "Focus goals"} icon={<Target size={16} aria-hidden />} actions={<Link to="/goals" className="btn btn-sm btn-ghost">Goals</Link>}>
      {list.length === 0 ? (
        <Empty icon={<Target size={20} />} title="No focus goals" action={<Link className="btn btn-sm" to="/goals?new=1">Create a goal</Link>}>
          Long-term goals only shape your days if they're connected to them.
        </Empty>
      ) : (
        <div className="col gap-12">
          {list.map((g) => (
            <Link key={g.id} to={`/goals/${g.id}`} style={{ textDecoration: "none" }} className="col gap-4">
              <span className="strong">{g.title}</span>
              <GoalProgressLine goal={g} />
              {g.is_focus && (!g.last_activity || g.last_activity.slice(0, 10) < d.date) && d.goals_attention.includes(g) && (
                <span className="tiny muted">
                  <AlertTriangle size={11} aria-hidden /> No completed tasks for this goal in the last week.
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function FocusWidget({ d }: { d: TodayData }) {
  const s = d.running_session;
  return (
    <Card title="Focus" icon={<Timer size={16} aria-hidden />}>
      {s ? (
        <div className="col gap-8">
          <p>
            <strong>In progress:</strong> {s.objective ?? "Focus session"}
          </p>
          <Link className="btn btn-primary" to="/focus">
            Return to session
          </Link>
        </div>
      ) : (
        <div className="col gap-8">
          <p className="small muted">{d.snapshot.focus_min ? `${fmtMin(d.snapshot.focus_min)} of focused work today.` : "No focus sessions yet today."}</p>
          <div className="row wrap">
            <Link className="btn btn-primary" to="/focus">
              <Play size={15} aria-hidden /> Start focus
            </Link>
            <Link className="btn" to="/focus?kind=study">
              Study session
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

function ReflectionWidget({ d }: { d: TodayData }) {
  const evening = d.now_min >= 17 * 60;
  return (
    <Card title="Daily reflection" icon={<NotebookPen size={16} aria-hidden />}>
      {d.reflection_id ? (
        <p className="small">
          Reflected today. <Link to={`/journal?open=${d.reflection_id}`}>Open entry</Link>
        </p>
      ) : (
        <div className="row between wrap">
          <p className="small muted">{evening ? "Five minutes: what went well, what didn't, what matters tomorrow." : "Come back this evening to close the loop on today."}</p>
          <Link className={`btn btn-sm ${evening ? "btn-primary" : ""}`} to="/journal?new=daily">
            Reflect
          </Link>
        </div>
      )}
    </Card>
  );
}

function PeopleWidget({ d }: { d: TodayData }) {
  if (!d.people_to_contact.length && !d.birthdays.length) return null;
  return (
    <Card title="People" icon={<Users size={16} aria-hidden />} actions={<Link to="/people" className="btn btn-sm btn-ghost">People</Link>}>
      <div className="list">
        {d.birthdays.map((b) => (
          <div key={b.id} className="item">
            <Gift size={15} aria-hidden />
            <span className="grow">
              {b.name}'s birthday {b.inDays === 0 ? "is today" : `in ${b.inDays} day${b.inDays === 1 ? "" : "s"}`}
            </span>
          </div>
        ))}
        {d.people_to_contact.map((p) => (
          <div key={p.id} className="item">
            <Users size={15} aria-hidden />
            <Link to={`/people?open=${p.id}`} className="grow" style={{ textDecoration: "none" }}>
              {p.name}
            </Link>
            <span className="small muted">{p.days} days</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LearningWidget({ d }: { d: TodayData }) {
  if (!d.flashcards_due) return null;
  return (
    <Card title="Flashcards" icon={<BookOpen size={16} aria-hidden />}>
      <div className="row between">
        <span>
          <strong>{d.flashcards_due}</strong> due for review
        </span>
        <Link className="btn btn-sm btn-primary" to="/learning/review">
          Review
        </Link>
      </div>
    </Card>
  );
}

function CustomizeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useProfile();
  const mut = useMutate();
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    if (open && profile.data) setList(profile.data.dashboard_widgets);
  }, [open, profile.data]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customise Today"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={async () => {
              await mut.call("/profile", { dashboard_widgets: list }, "PATCH", { success: "Dashboard updated" });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="small muted" style={{ marginBottom: 12 }}>
        Show only what helps you act. Everything else stays one click away.
      </p>
      <div className="list">
        {DASHBOARD_WIDGETS.map(([k]) => k)
          .sort((a, b) => (list.includes(a) ? list.indexOf(a) : 99) - (list.includes(b) ? list.indexOf(b) : 99))
          .map((k) => {
            const on = list.includes(k);
            const i = list.indexOf(k);
            return (
              <div key={k} className="item">
                <label className="check grow">
                  <input type="checkbox" checked={on} onChange={() => setList(on ? list.filter((x) => x !== k) : [...list, k])} />
                  {label(DASHBOARD_WIDGETS, k)}
                </label>
                {on && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => move(i, -1)} aria-label={`Move ${label(DASHBOARD_WIDGETS, k)} up`} disabled={i === 0}>
                      ↑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => move(i, 1)} aria-label={`Move ${label(DASHBOARD_WIDGETS, k)} down`} disabled={i === list.length - 1}>
                      ↓
                    </Button>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </Modal>
  );
}
