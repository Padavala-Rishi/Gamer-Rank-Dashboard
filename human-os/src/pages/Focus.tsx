import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Coffee, Pause, Play, Square, Timer, Zap, BrainCircuit, Lightbulb } from "lucide-react";
import { useApi, useDocumentTitle, useLocalState, useMutate, useProfile, useResource } from "../lib/hooks";
import type { Distraction, FocusSession, Subject, Task, Topic } from "../lib/types";
import { Button, Card, Field, Modal, PageHeader, Scale, Seg, Skeleton, Stat } from "../components/ui";
import { BarChart, BarList } from "../components/charts";
import { DISTRACTION_KINDS, FOCUS_KINDS, MASTERY_LEVELS, label } from "../../shared/constants";
import { fmtMin } from "../lib/format";
import { get, ApiError } from "../lib/api";
import { useUI } from "../layout/UIContext";
import { useToast } from "../components/Toast";

interface Stats {
  sessions: FocusSession[];
  total_min: number;
  completed: number;
  abandoned: number;
  avg_quality: number | null;
  distractions_total: number;
  distractions_by_kind: Record<string, number>;
  distractions_by_hour: Record<string, number>;
  recent_distractions: Distraction[];
}

interface PauseState {
  pausedAt: number | null;
  pausedMs: number;
}

const PRESET: Record<string, number> = { pomodoro: 25, deep_work: 90, study: 45, custom: 30 };

export default function Focus() {
  useDocumentTitle("Focus");
  const active = useApi<FocusSession | null>("/focus/active", { refetchInterval: 60_000 });
  const stats = useApi<Stats>("/focus/stats");
  const [params] = useSearchParams();
  const twoTaskId = params.get("two");

  return (
    <div className="page">
      <PageHeader title="Focus" subtitle="One thing at a time. Distractions get noted, not judged." />
      {active.isLoading ? <Skeleton lines={6} /> : active.data ? <RunningSession s={active.data} /> : twoTaskId ? <TwoMinuteSetup taskId={twoTaskId} /> : <Setup initialKind={params.get("kind") ?? undefined} />}
      <h2 className="section-title">Last 30 days</h2>
      {stats.data && <StatsView s={stats.data} />}
    </div>
  );
}

function Setup({ initialKind }: { initialKind?: string }) {
  const profile = useProfile();
  const [kind, setKind] = useState(initialKind && PRESET[initialKind] ? initialKind : "pomodoro");
  const [minutes, setMinutes] = useState(PRESET[kind]);
  const [objective, setObjective] = useState("");
  const [taskId, setTaskId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const tasks = useResource<Task>("tasks", { status: "todo,doing" });
  const subjects = useResource<Subject>("subjects", { status: "active" });
  const topics = useResource<Topic>("topics", { subject_id: subjectId }, { enabled: !!subjectId });
  const mut = useMutate();
  useEffect(() => {
    setMinutes(kind === "pomodoro" ? (profile.data?.default_focus_min ?? 25) : PRESET[kind]);
  }, [kind, profile.data?.default_focus_min]);

  const start = async () => {
    const t = tasks.data?.find((x) => x.id === taskId);
    await mut
      .call("/focus/start", {
        kind,
        planned_min: minutes,
        objective: objective.trim() || t?.title || (subjectId ? `Study: ${subjects.data?.find((s) => s.id === subjectId)?.title}` : null),
        task_id: taskId || null,
        subject_id: subjectId || null,
        topic_id: topicId || null,
      })
      .catch(() => {});
    if ("Notification" in window && Notification.permission === "default" && profile.data?.notification_prefs.browser) Notification.requestPermission().catch(() => {});
  };

  return (
    <Card>
      <div className="col gap-16">
        <Seg label="Session type" value={kind} onChange={setKind} options={FOCUS_KINDS} />
        <div className="form-grid">
          <Field label="What will you accomplish?" full hint="A concrete objective makes it easier to start — and to know when you're done." htmlFor="f-obj">
            <input id="f-obj" className="input" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Finish the first draft of section 2" />
          </Field>
          <Field label="Minutes" htmlFor="f-min">
            <input id="f-min" className="input" type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="Task (optional)" htmlFor="f-task">
            <select id="f-task" className="select" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">— None —</option>
              {(tasks.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
          {(kind === "study" || subjectId) && (
            <>
              <Field label="Subject" htmlFor="f-sub">
                <select id="f-sub" className="select" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(""); }}>
                  <option value="">— None —</option>
                  {(subjects.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Topic" htmlFor="f-top">
                <select id="f-top" className="select" value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId}>
                  <option value="">— None —</option>
                  {(topics.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
        <div className="row wrap between">
          <p className="small muted">Before you start: phone in another room, notifications off, one tab. The app can't block other apps for you — your environment can.</p>
          <Button variant="primary" size="lg" onClick={start} loading={mut.pending}>
            <Play size={18} aria-hidden /> Start {fmtMin(minutes)}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TwoMinuteSetup({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mut = useMutate();
  useEffect(() => {
    get<Task>(`/r/tasks/${taskId}`)
      .then((t) => {
        setTask(t);
        setStep(t.first_step ?? "");
      })
      .catch(() => setError("That task couldn't be found."));
  }, [taskId]);
  if (error) return <Card><p>{error}</p></Card>;
  if (!task) return <Skeleton lines={3} />;
  const suggestions = [`Open what you need for “${task.title}”`, "Write one sentence / one line of code", "Read the first paragraph or definition", "List the three sub-steps"];
  return (
    <Card title="2-minute mode" icon={<Zap size={16} aria-hidden />} className="accent">
      <div className="col gap-12">
        <p>
          <strong>{task.title}</strong> feels big. You don't have to finish it — just start. What's the tiniest possible first action?
        </p>
        <input className="input" style={{ fontSize: 16 }} value={step} onChange={(e) => setStep(e.target.value)} placeholder="e.g. Open your notes and read the first definition" aria-label="Smallest first step" autoFocus />
        <div className="chips">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={() => setStep(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button
            variant="primary"
            size="lg"
            loading={mut.pending}
            onClick={async () => {
              const first = step.trim() || suggestions[0];
              await mut.run(async () => {
                if (first !== task.first_step) await mut.update("tasks", task.id, { first_step: first }, { silentError: true }).catch(() => {});
                await mut.call("/focus/start", { kind: "custom", planned_min: 2, task_id: task.id, objective: first }, "POST", { silentError: true }).catch((e) => {
                  if (!(e instanceof ApiError && e.status === 409)) throw e;
                });
              });
            }}
          >
            <Play size={18} aria-hidden /> Just 2 minutes
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RunningSession({ s }: { s: FocusSession }) {
  const [pause, setPause] = useLocalState<PauseState>(`pause:${s.id}`, { pausedAt: null, pausedMs: 0 });
  const [now, setNow] = useState(Date.now());
  const [distracted, setDistracted] = useState(false);
  const [finishing, setFinishing] = useState<null | "completed" | "abandoned">(null);
  const [onBreak, setOnBreak] = useState<number | null>(null);
  const [notified, setNotified] = useLocalState<string | null>("focus-notified", null);
  const profile = useProfile();
  const mut = useMutate();
  const ui = useUI();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const pausedNow = pause.pausedAt ? now - pause.pausedAt : 0;
  const focusedMs = Math.max(0, now - Date.parse(s.started_at!) - pause.pausedMs - pausedNow);
  const plannedMs = s.planned_min * 60000;
  const remaining = plannedMs - focusedMs;
  const over = remaining < 0;
  const mm = Math.floor(Math.abs(remaining) / 60000);
  const ss = Math.floor((Math.abs(remaining) % 60000) / 1000);
  const display = `${over ? "+" : ""}${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const isTwoMin = s.planned_min <= 2 && s.kind === "custom";
  useDocumentTitle(`${display} · Focus`);

  useEffect(() => {
    if (over && notified !== s.id) {
      setNotified(s.id);
      if ("Notification" in window && Notification.permission === "granted" && profile.data?.notification_prefs.browser) new Notification("Focus session complete", { body: s.objective ?? "Time for a break." });
    }
  }, [over, notified, s.id, s.objective, setNotified, profile.data?.notification_prefs.browser]);

  const togglePause = () => setPause(pause.pausedAt ? { pausedAt: null, pausedMs: pause.pausedMs + (Date.now() - pause.pausedAt) } : { ...pause, pausedAt: Date.now() });
  const extend = (min: number) => mut.update("focus-sessions", s.id, { planned_min: Math.min(600, Math.ceil(focusedMs / 60000) + min) }).catch(() => {});
  const breakMin = profile.data?.pomodoro_break_min ?? 5;
  const breakLeft = onBreak ? Math.max(0, onBreak - now) : 0;

  return (
    <Card className="accent">
      <div className="col gap-16" style={{ alignItems: "center", textAlign: "center", padding: "12px 0" }}>
        <span className="badge accent">{label(FOCUS_KINDS, s.kind)}</span>
        <p className="now-action" style={{ maxWidth: 640 }}>
          {s.objective ?? "Focus"}
        </p>
        <div className={`timer-ring ${pause.pausedAt || over ? "" : "running"}`}>
          <svg viewBox="0 0 200 200" aria-hidden>
            <circle cx="100" cy="100" r="92" fill="none" stroke="var(--ring-track)" strokeWidth="7" />
            <circle
              cx="100"
              cy="100"
              r="92"
              fill="none"
              stroke={over ? "var(--ring-warm)" : "var(--accent)"}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 92}
              strokeDashoffset={2 * Math.PI * 92 * (1 - Math.min(1, focusedMs / plannedMs))}
              style={{ transition: "stroke-dashoffset 900ms linear, stroke 400ms ease" }}
            />
          </svg>
          <div className="timer" role="timer" aria-live="off" aria-label={`${over ? "Over time by" : "Remaining"} ${mm} minutes ${ss} seconds`} style={{ color: over ? "var(--accent)" : undefined, opacity: pause.pausedAt ? 0.45 : 1 }}>
            {display}
          </div>
          <span className="timer-sub">{pause.pausedAt ? "Paused" : over ? "Over time" : "Remaining"}</span>
        </div>
        {over && !isTwoMin && (
          <div className="col gap-8" style={{ alignItems: "center" }}>
            <p className="strong">Planned time is up. Nice work.</p>
            <p className="small muted">Take a {breakMin}-minute break before the next session — rest is part of the work.</p>
          </div>
        )}
        {over && isTwoMin && (
          <div className="col gap-8" style={{ alignItems: "center" }}>
            <p className="strong">You started. That was the hard part.</p>
            <div className="row wrap" style={{ justifyContent: "center" }}>
              <Button variant="primary" onClick={() => extend(5)}>
                Continue for 5 minutes?
              </Button>
              <Button onClick={() => extend(25)}>Keep going (25 min)</Button>
              <Button variant="ghost" onClick={() => setFinishing("completed")}>
                Stop here
              </Button>
            </div>
          </div>
        )}
        {over && !isTwoMin && (
          <div className="row wrap" style={{ justifyContent: "center" }}>
            <Button onClick={() => extend(10)}>+10 min</Button>
          </div>
        )}
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <Button size="lg" onClick={togglePause}>
            {pause.pausedAt ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />} {pause.pausedAt ? "Resume" : "Pause"}
          </Button>
          <Button size="lg" onClick={() => setDistracted(true)}>
            <BrainCircuit size={16} aria-hidden /> I got distracted
          </Button>
          <Button size="lg" onClick={() => ui.openCapture("note")} title="Park a thought without losing focus">
            <Lightbulb size={16} aria-hidden /> Park a thought
          </Button>
          <Button size="lg" variant="primary" onClick={() => setFinishing("completed")}>
            <Square size={16} aria-hidden /> Finish
          </Button>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setFinishing("abandoned")}>
          Abandon session
        </button>
        {over && !isTwoMin && (
          <Button variant="ghost" onClick={() => setOnBreak(Date.now() + breakMin * 60000)}>
            <Coffee size={15} aria-hidden /> {onBreak ? (breakLeft > 0 ? `Break: ${Math.ceil(breakLeft / 60000)} min left` : "Break over — ready when you are") : `Start a ${breakMin}-minute break`}
          </Button>
        )}
      </div>
      <DistractionModal open={distracted} onClose={() => setDistracted(false)} sessionId={s.id} />
      <FinishModal open={finishing !== null} status={finishing ?? "completed"} onClose={() => setFinishing(null)} s={s} focusedMin={Math.round(focusedMs / 60000)} onDone={() => setPause({ pausedAt: null, pausedMs: 0 })} />
    </Card>
  );
}

function DistractionModal({ open, onClose, sessionId }: { open: boolean; onClose: () => void; sessionId: string }) {
  const [kind, setKind] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const mut = useMutate();
  const toast = useToast();
  const save = async (k: string) => {
    try {
      await mut.create("distractions", { session_id: sessionId, kind: k, note: note || null }, { silentError: true });
      toast.show("Noted. Gently back to it.");
      setKind(null);
      setNote("");
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="What pulled you away?">
      <p className="small muted" style={{ marginBottom: 12 }}>
        No judgement — noticing is the skill. Patterns show up in your stats later.
      </p>
      <div className="chips">
        {DISTRACTION_KINDS.map(([k, l]) => (
          <button key={k} className="chip" aria-pressed={kind === k} onClick={() => (note ? setKind(k) : save(k))}>
            {l}
          </button>
        ))}
      </div>
      <input className="input mt-12" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note (then pick a type)" aria-label="Distraction note" />
      {kind && note && (
        <div className="row mt-12" style={{ justifyContent: "flex-end" }}>
          <Button variant="primary" onClick={() => save(kind)}>
            Save
          </Button>
        </div>
      )}
    </Modal>
  );
}

function FinishModal({ open, status, onClose, s, focusedMin, onDone }: { open: boolean; status: "completed" | "abandoned"; onClose: () => void; s: FocusSession; focusedMin: number; onDone: () => void }) {
  const [accomplished, setAccomplished] = useState("");
  const [distractions, setDistractions] = useState("");
  const [change, setChange] = useState("");
  const [quality, setQuality] = useState<number | null>(null);
  const [markDone, setMarkDone] = useState(false);
  const [mastery, setMastery] = useState<string>("");
  const mut = useMutate();
  const logged = useResource<Distraction>("distractions", { session_id: s.id }, { enabled: open });
  const finish = async () => {
    try {
      await mut.call(
        `/focus/${s.id}/finish`,
        { status, accomplished: accomplished || null, distraction_notes: distractions || null, change_next: change || null, quality, mark_task_done: markDone, topic_mastery: mastery === "" ? null : Number(mastery), actual_min: focusedMin },
        "POST",
        { success: status === "completed" ? `Session saved · ${fmtMin(focusedMin)} focused` : "Session ended" },
      );
      onDone();
      onClose();
    } catch {
      /* toast */
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={status === "completed" ? "Session review" : "End session"} wide>
      <div className="col gap-12">
        <p className="small muted">
          {fmtMin(focusedMin)} focused{(logged.data ?? []).length ? ` · ${(logged.data ?? []).length} distraction(s) logged` : ""}.
        </p>
        <Field label="What did you accomplish?" htmlFor="fin-acc">
          <textarea id="fin-acc" className="textarea" rows={2} value={accomplished} onChange={(e) => setAccomplished(e.target.value)} data-autofocus />
        </Field>
        <Field label="What distracted you?" htmlFor="fin-dis">
          <textarea id="fin-dis" className="textarea" rows={2} value={distractions} onChange={(e) => setDistractions(e.target.value)} />
        </Field>
        <Field label="What should change next time?" htmlFor="fin-ch">
          <textarea id="fin-ch" className="textarea" rows={2} value={change} onChange={(e) => setChange(e.target.value)} />
        </Field>
        <Field label="Session quality">
          <Scale name="Session quality" value={quality} onChange={setQuality} labels={["Scattered", "Deep flow"]} />
        </Field>
        {s.task_id && (
          <label className="check">
            <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} /> Mark the task as done
          </label>
        )}
        {s.topic_id && (
          <Field label="Update topic mastery" htmlFor="fin-mast">
            <select id="fin-mast" className="select" value={mastery} onChange={(e) => setMastery(e.target.value)}>
              <option value="">Leave unchanged</option>
              {MASTERY_LEVELS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Back to session</Button>
          <Button variant="primary" onClick={finish} loading={mut.pending}>
            {status === "completed" ? "Save session" : "End session"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function StatsView({ s }: { s: Stats }) {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const peakHour = useMemo(() => hours.reduce((best, h) => ((s.distractions_by_hour[h] ?? 0) > (s.distractions_by_hour[best] ?? 0) ? h : best), 0), [s, hours]);
  const topKind = Object.entries(s.distractions_by_kind).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="grid grid-2">
      <Card title="Focus">
        <div className="stats-row">
          <Stat label="Focused time" value={fmtMin(s.total_min)} />
          <Stat label="Sessions" value={s.completed} delta={s.abandoned ? `${s.abandoned} abandoned` : null} />
          <Stat label="Avg quality" value={s.avg_quality ?? "—"} unit={s.avg_quality ? "/5" : undefined} />
        </div>
        <div className="list mt-12">
          {s.sessions.slice(0, 6).map((x) => (
            <div key={x.id} className="item">
              <Timer size={14} className="muted" aria-hidden />
              <span className="grow ellipsis small">{x.objective ?? label(FOCUS_KINDS, x.kind)}</span>
              <span className="small muted">{x.local_date}</span>
              <span className="small num">{fmtMin(x.actual_min)}</span>
            </div>
          ))}
          {s.sessions.length === 0 && <p className="small muted">No sessions yet.</p>}
        </div>
      </Card>
      <Card title="Distraction patterns">
        {s.distractions_total === 0 ? (
          <p className="small muted">No distractions logged. When you notice one, tap “I got distracted” — the patterns become useful after a week or two.</p>
        ) : (
          <div className="col gap-12">
            <p className="small">
              {s.distractions_total} logged. Most common: <strong>{label(DISTRACTION_KINDS, topKind[0])}</strong>. Peak hour: <strong>{String(peakHour).padStart(2, "0")}:00</strong>.
            </p>
            <p className="small muted">Decision this supports: change the environment around your peak hour (e.g. phone in another room from {String(peakHour).padStart(2, "0")}:00).</p>
            <BarList items={Object.entries(s.distractions_by_kind).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: label(DISTRACTION_KINDS, k), value: v }))} />
            <BarChart
              label="Distractions by hour of day"
              dates={hours.map(String)}
              values={hours.map((h) => s.distractions_by_hour[h] ?? 0)}
              height={110}
              xLabel={(i) => `${String(i).padStart(2, "0")}:00`}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
