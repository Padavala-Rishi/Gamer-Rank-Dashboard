// Focus timer as a pure, timestamp-based state machine. Because it stores timestamps rather than counting
// ticks, it stays correct when a tab is backgrounded, the phone locks, or the page is refreshed.

export type TimerConfig = { focusMin: number; shortMin: number; longMin: number; cycles: number; pomodoro: boolean };
export type Phase = "focus" | "short" | "long";

export type TimerState = {
  phase: Phase;
  running: boolean;
  /** ms left when paused / not started; while running, the remaining at `anchor` */
  remainingMs: number;
  /** wall-clock ms when the current run segment began (only meaningful while running) */
  anchor: number | null;
  /** completed focus blocks in the current set */
  cycle: number;
  /** focus milliseconds accumulated in the current (unfinished) focus block */
  workedMs: number;
  /** stopwatch mode (no countdown) */
  elapsedMs: number;
};

export type TimerEvent = { type: "focus_complete"; minutes: number } | { type: "break_complete" };

export const DEFAULT_TIMER: TimerConfig = { focusMin: 25, shortMin: 5, longMin: 15, cycles: 4, pomodoro: true };

export const phaseMs = (cfg: TimerConfig, phase: Phase) => (phase === "focus" ? cfg.focusMin : phase === "short" ? cfg.shortMin : cfg.longMin) * 60_000;

export function initialTimer(cfg: TimerConfig): TimerState {
  return { phase: "focus", running: false, remainingMs: phaseMs(cfg, "focus"), anchor: null, cycle: 0, workedMs: 0, elapsedMs: 0 };
}

export function start(s: TimerState, now: number): TimerState {
  if (s.running) return s;
  return { ...s, running: true, anchor: now };
}

export function pause(s: TimerState, now: number): TimerState {
  if (!s.running || s.anchor == null) return s;
  const spent = Math.max(0, now - s.anchor);
  return {
    ...s, running: false, anchor: null,
    remainingMs: Math.max(0, s.remainingMs - spent),
    workedMs: s.phase === "focus" ? s.workedMs + spent : s.workedMs,
    elapsedMs: s.elapsedMs + spent,
  };
}

/** ms remaining right now (countdown) */
export function remaining(s: TimerState, now: number): number {
  if (!s.running || s.anchor == null) return s.remainingMs;
  return Math.max(0, s.remainingMs - Math.max(0, now - s.anchor));
}

/** stopwatch elapsed ms right now */
export function elapsed(s: TimerState, now: number): number {
  return s.elapsedMs + (s.running && s.anchor != null ? Math.max(0, now - s.anchor) : 0);
}

/**
 * Advance the countdown. If the phase has finished it stops, credits exactly the phase length (never the time the
 * tab was closed afterwards), and queues the next phase paused — the user decides when to continue.
 */
export function tick(s: TimerState, cfg: TimerConfig, now: number): { state: TimerState; events: TimerEvent[] } {
  if (!cfg.pomodoro || !s.running || remaining(s, now) > 0) return { state: s, events: [] };
  const events: TimerEvent[] = [];
  let cycle = s.cycle;
  let next: Phase;
  if (s.phase === "focus") {
    const worked = s.workedMs + (s.remainingMs - 0); // the whole remaining segment elapsed
    events.push({ type: "focus_complete", minutes: Math.max(1, Math.round(worked / 60_000)) });
    cycle += 1;
    next = cycle % cfg.cycles === 0 ? "long" : "short";
  } else {
    events.push({ type: "break_complete" });
    next = "focus";
  }
  return {
    state: { phase: next, running: false, anchor: null, remainingMs: phaseMs(cfg, next), cycle, workedMs: 0, elapsedMs: 0 },
    events,
  };
}

/** Skip the current phase. Focus time already spent counts if it was at least a minute. */
export function skip(s: TimerState, cfg: TimerConfig, now: number): { state: TimerState; events: TimerEvent[] } {
  const p = pause(s, now);
  const events: TimerEvent[] = [];
  let cycle = p.cycle;
  let next: Phase;
  if (p.phase === "focus") {
    if (p.workedMs >= 60_000) events.push({ type: "focus_complete", minutes: Math.round(p.workedMs / 60_000) });
    cycle += 1;
    next = cycle % cfg.cycles === 0 ? "long" : "short";
  } else next = "focus";
  return { state: { phase: next, running: false, anchor: null, remainingMs: phaseMs(cfg, next), cycle, workedMs: 0, elapsedMs: 0 }, events };
}

/** Finish early (e.g. stop the stopwatch): minutes of focus to log, if at least one minute. */
export function finish(s: TimerState, cfg: TimerConfig, now: number): { minutes: number; state: TimerState } {
  const p = pause(s, now);
  const ms = cfg.pomodoro ? (p.phase === "focus" ? p.workedMs : 0) : p.elapsedMs;
  const minutes = ms >= 60_000 ? Math.round(ms / 60_000) : 0;
  return { minutes, state: initialTimer(cfg) };
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60), sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
