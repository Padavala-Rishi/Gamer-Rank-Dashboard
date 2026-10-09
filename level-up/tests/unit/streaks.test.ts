import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { computeStreaks, consistency, weeklyStreak } from "@/lib/game/streaks";

const today = "2026-10-09"; // Friday
const days = (...offs: number[]) => offs.map((o) => addDays(today, -o));

describe("daily streak", () => {
  it("is zero with no activity", () => {
    expect(computeStreaks({ activeDates: [], today })).toEqual({ current: 0, best: 0, atRisk: false });
  });
  it("counts consecutive days including today", () => {
    expect(computeStreaks({ activeDates: days(0, 1, 2), today })).toMatchObject({ current: 3, best: 3, atRisk: false });
  });
  it("keeps yesterday's streak alive until today ends (at risk, not broken)", () => {
    expect(computeStreaks({ activeDates: days(1, 2, 3), today })).toMatchObject({ current: 3, best: 3, atRisk: true });
  });
  it("breaks after a missed day and remembers the best run", () => {
    expect(computeStreaks({ activeDates: days(0, 1, 4, 5, 6, 7), today })).toMatchObject({ current: 2, best: 4 });
  });
  it("is zero when the last activity was two days ago", () => {
    expect(computeStreaks({ activeDates: days(2, 3), today })).toMatchObject({ current: 0, best: 2 });
  });
  it("lets planned rest days bridge a gap without adding to the count", () => {
    expect(computeStreaks({ activeDates: days(0, 1, 3, 4), restDates: days(2), today })).toMatchObject({ current: 4, best: 4 });
    expect(computeStreaks({ activeDates: days(0, 1, 3, 4), today })).toMatchObject({ current: 2, best: 2 });
  });
  it("supports a configured rest weekday (e.g. Sunday)", () => {
    // Fri today; active Thu, Wed, and the previous Sat; Sunday is a rest day so Sat→Mon is unbroken
    const active = ["2026-10-09", "2026-10-08", "2026-10-07", "2026-10-06", "2026-10-05", "2026-10-03"];
    expect(computeStreaks({ activeDates: active, restWeekdays: [7], today })).toMatchObject({ current: 6, best: 6 });
  });
  it("does not loop forever when every weekday is a rest day", () => {
    expect(computeStreaks({ activeDates: days(5), restWeekdays: [1, 2, 3, 4, 5, 6, 7], today }).best).toBe(1);
  });
});

describe("weekly streak & consistency", () => {
  it("counts consecutive weeks meeting the minimum", () => {
    // weeks start Monday. This week (from Mon 5th) has 3 active days so far; last two weeks had 4 each
    const active = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-02", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-25"];
    const w = weeklyStreak({ activeDates: active, today, minDays: 4 });
    expect(w.current).toBe(2);
    expect(w.thisWeekDays).toBe(3);
  });
  it("counts the in-progress week once it qualifies", () => {
    const active = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    expect(weeklyStreak({ activeDates: active, today, minDays: 4 }).current).toBe(1);
  });
  it("measures consistency over a window, counting rest days as kept", () => {
    const c = consistency({ activeDates: days(0, 1, 2), restDates: days(3), today, days: 7 });
    expect(c.kept).toBe(4);
    expect(c.pct).toBeCloseTo(4 / 7);
  });
});
