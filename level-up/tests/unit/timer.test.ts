import { describe, expect, it } from "vitest";
import { DEFAULT_TIMER, elapsed, finish, formatClock, initialTimer, pause, remaining, skip, start, tick, type TimerConfig } from "@/lib/game/timer";

const cfg: TimerConfig = { ...DEFAULT_TIMER, focusMin: 25, shortMin: 5, longMin: 15, cycles: 4 };
const MIN = 60_000;

describe("focus timer", () => {
  it("counts down from the start time and survives a pause/resume", () => {
    let s = start(initialTimer(cfg), 0);
    expect(remaining(s, 10 * MIN)).toBe(15 * MIN);
    s = pause(s, 10 * MIN);
    expect(remaining(s, 999 * MIN)).toBe(15 * MIN);   // paused time does not run
    s = start(s, 100 * MIN);
    expect(remaining(s, 105 * MIN)).toBe(10 * MIN);
  });

  it("completes a focus block, credits exactly the block, and queues a paused short break", () => {
    const s = start(initialTimer(cfg), 0);
    const { state, events } = tick(s, cfg, 26 * MIN);
    expect(events).toEqual([{ type: "focus_complete", minutes: 25 }]);
    expect(state).toMatchObject({ phase: "short", running: false, cycle: 1 });
    expect(state.remainingMs).toBe(5 * MIN);
  });

  it("does not credit time while the tab was closed: coming back hours later still logs 25 minutes", () => {
    const s = start(initialTimer(cfg), 0);
    const { events } = tick(s, cfg, 6 * 60 * MIN);
    expect(events).toEqual([{ type: "focus_complete", minutes: 25 }]);
  });

  it("credits paused work correctly across a split block", () => {
    let s = start(initialTimer(cfg), 0);
    s = pause(s, 10 * MIN);
    s = start(s, 50 * MIN);
    const { events } = tick(s, cfg, 65 * MIN + 1);
    expect(events).toEqual([{ type: "focus_complete", minutes: 25 }]);
  });

  it("takes a long break after the configured number of focus blocks", () => {
    let s = initialTimer(cfg);
    let t = 0;
    const phases: string[] = [];
    for (let i = 0; i < 8; i++) {
      s = start(s, t);
      t += 30 * MIN;
      const r = tick(s, cfg, t);
      s = r.state;
      phases.push(s.phase);
    }
    expect(phases).toEqual(["short", "focus", "short", "focus", "short", "focus", "long", "focus"]);
  });

  it("skip logs partial focus only if it was at least a minute", () => {
    let s = start(initialTimer(cfg), 0);
    expect(skip(s, cfg, 20_000).events).toEqual([]);
    s = start(initialTimer(cfg), 0);
    expect(skip(s, cfg, 12 * MIN).events).toEqual([{ type: "focus_complete", minutes: 12 }]);
  });

  it("stopwatch mode accumulates elapsed time and finish() reports whole minutes", () => {
    const free: TimerConfig = { ...cfg, pomodoro: false };
    let s = start(initialTimer(free), 0);
    expect(elapsed(s, 90_000)).toBe(90_000);
    s = pause(s, 7 * MIN + 20_000);
    expect(finish(s, free, 8 * MIN).minutes).toBe(7);
    expect(finish(start(initialTimer(free), 0), free, 30_000).minutes).toBe(0);
  });

  it("formats the clock", () => {
    expect(formatClock(25 * MIN)).toBe("25:00");
    expect(formatClock(61_500)).toBe("01:02");
    expect(formatClock(0)).toBe("00:00");
  });
});
