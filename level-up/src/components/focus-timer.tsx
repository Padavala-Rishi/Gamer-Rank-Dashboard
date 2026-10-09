"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { logFocusSession } from "@/app/actions/college";
import { todayIn } from "@/lib/dates";
import { DEFAULT_TIMER, elapsed, finish, formatClock, initialTimer, pause, phaseMs, remaining, skip, start, tick, type TimerConfig, type TimerEvent, type TimerState } from "@/lib/game/timer";
import { Icon } from "./icon";
import { Field } from "./ui";
import { useUI } from "./ui-context";

type Saved = { state: TimerState; pomodoro: boolean; subjectId: string; projectId: string; taskId: string; track: string };
type Opt = { id: string; name: string };

/**
 * Pomodoro / stopwatch focus timer. It stores timestamps (not ticks), so it survives backgrounding, screen lock
 * and reloads. Finished blocks are logged as focus sessions: that is where "focused minutes per subject" comes from.
 */
export function FocusTimer({ category, tz, config, subjects = [], projects = [], tasks = [], tracks }: {
  category: "college" | "dev" | "basketball"; tz: string; config: { focus: number; short: number; long: number; cycles: number };
  subjects?: Opt[]; projects?: Opt[]; tasks?: Opt[]; tracks?: { key: string; label: string }[];
}) {
  const { toast } = useUI();
  const key = `lu:timer:${category}`;
  const [pomodoro, setPomodoro] = useState(true);
  const cfg: TimerConfig = { focusMin: config.focus, shortMin: config.short, longMin: config.long, cycles: config.cycles, pomodoro };
  const [state, setState] = useState<TimerState>(() => initialTimer({ ...DEFAULT_TIMER, focusMin: config.focus, shortMin: config.short, longMin: config.long, cycles: config.cycles }));
  const [now, setNow] = useState(0);
  const [subjectId, setSubjectId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [track, setTrack] = useState("");
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const save = useCallback((s: TimerState, extra?: Partial<Saved>) => {
    try { localStorage.setItem(key, JSON.stringify({ state: s, pomodoro, subjectId, projectId, taskId, track, ...extra })); } catch { /* private mode: timer still works for this tab */ }
  }, [key, pomodoro, subjectId, projectId, taskId, track]);

  // restore after a reload
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        setState(s.state); setPomodoro(s.pomodoro); setSubjectId(s.subjectId ?? ""); setProjectId(s.projectId ?? ""); setTaskId(s.taskId ?? ""); setTrack(s.track ?? "");
      }
    } catch { /* ignore corrupt storage */ }
    setNow(Date.now()); setReady(true);
  }, [key]);

  const log = useCallback(async (minutes: number, mode: "pomodoro" | "free") => {
    const res = await logFocusSession({
      category, session_date: todayIn(tz), minutes, planned_minutes: mode === "pomodoro" ? config.focus : null, mode,
      subject_id: subjectId || null, project_id: projectId || null, task_id: taskId || null, track: track || null,
    });
    if (res.ok) toast(`Logged ${minutes} focused minute${minutes === 1 ? "" : "s"}`, "good"); else toast(res.error, "bad");
  }, [category, tz, config.focus, subjectId, projectId, taskId, track, toast]);

  const handle = useCallback((events: TimerEvent[]) => {
    for (const e of events) {
      if (e.type === "focus_complete") { void log(e.minutes, "pomodoro"); try { navigator.vibrate?.(200); } catch { /* ok */ } toast("Focus block done. Take your break.", "info"); }
      else toast("Break over. Ready when you are.", "info");
    }
  }, [log, toast]);

  // clock
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const r = tick(stateRef.current, cfg, t);
      if (r.events.length) { stateRef.current = r.state; setState(r.state); save(r.state); handle(r.events); }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pomodoro, handle, save]);

  useEffect(() => { if (ready) save(state); }, [ready, state, save]);

  const phaseLabel = state.phase === "focus" ? "Focus" : state.phase === "short" ? "Short break" : "Long break";
  const ms = pomodoro ? remaining(state, now || Date.now()) : elapsed(state, now || Date.now());
  const total = pomodoro ? phaseMs(cfg, state.phase) : 0;
  const pct = pomodoro && total ? 1 - ms / total : 0;
  const R = 88, C = 2 * Math.PI * R;
  const running = state.running;

  const act = (fn: () => void) => { fn(); };
  const onFinish = () => {
    const r = finish(state, cfg, Date.now());
    setState(r.state); save(r.state);
    if (r.minutes > 0) void log(r.minutes, pomodoro ? "pomodoro" : "free"); else toast("Under a minute: nothing to log", "info");
  };

  return (
    <div className="card p-4 sm:p-5" data-testid="focus-timer">
      <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="relative mx-auto size-52">
          <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden>
            <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
            <circle cx="100" cy="100" r={R} fill="none" stroke={state.phase === "focus" ? "var(--accent)" : "var(--good)"} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, pct)))} style={{ transition: "stroke-dashoffset 0.3s linear" }} />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">{pomodoro ? phaseLabel : "Stopwatch"}</div>
            <div className="num text-4xl font-bold tabular-nums" role="timer" aria-live="off" data-testid="timer-clock">{formatClock(ms)}</div>
            {pomodoro && <div className="mt-0.5 text-xs text-faint">block {(state.cycle % cfg.cycles) + (state.phase === "focus" ? 1 : 0)} of {cfg.cycles}</div>}
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            {category === "college" && (
              <Field label="Subject" htmlFor="ft-subj" className="col-span-2">
                <select id="ft-subj" className="select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={running}><option value="">No subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </Field>
            )}
            {category === "dev" && (
              <>
                <Field label="Project" htmlFor="ft-proj"><select id="ft-proj" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={running}><option value="">No project</option>{projects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                <Field label="Learning track" htmlFor="ft-track"><select id="ft-track" className="select" value={track} onChange={(e) => setTrack(e.target.value)} disabled={running}><option value="">None</option>{tracks?.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
              </>
            )}
            <Field label="For quest (optional)" htmlFor="ft-task" className="col-span-2" hint="Time logged here counts toward the quest and can earn a focused-work bonus.">
              <select id="ft-task" className="select" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={running}><option value="">No quest</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <button className="btn btn-primary" onClick={() => act(() => setState(pause(state, Date.now())))}><Icon name="pause" size={16} />Pause</button>
            ) : (
              <button className="btn btn-primary" onClick={() => act(() => setState(start(state, Date.now())))} data-testid="timer-start"><Icon name="play" size={16} />{state.remainingMs < phaseMs(cfg, state.phase) || state.elapsedMs > 0 ? "Resume" : "Start"}</button>
            )}
            {pomodoro && <button className="btn" onClick={() => { const r = skip(state, cfg, Date.now()); setState(r.state); handle(r.events); }}><Icon name="skip-forward" size={16} />Skip</button>}
            <button className="btn" onClick={onFinish} data-testid="timer-finish"><Icon name="check" size={16} />Finish & log</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setState(initialTimer(cfg)); }} disabled={!running && state.workedMs === 0 && state.elapsedMs === 0}><Icon name="rotate-ccw" size={14} />Reset</button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button className="chip" aria-pressed={pomodoro} onClick={() => { setPomodoro(true); setState(initialTimer({ ...cfg, pomodoro: true })); }} disabled={running}>Pomodoro {config.focus}/{config.short}</button>
            <button className="chip" aria-pressed={!pomodoro} onClick={() => { setPomodoro(false); setState(initialTimer({ ...cfg, pomodoro: false })); }} disabled={running}>Stopwatch</button>
          </div>
          <p className="text-xs text-muted">Only completed focus time is logged, and never time the tab spent closed. Change lengths in Settings.</p>
        </div>
      </div>
    </div>
  );
}
