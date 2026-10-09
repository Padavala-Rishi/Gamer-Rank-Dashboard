import { describe, expect, it } from "vitest";
import { describeRecurrence, occurrencesBetween, occursOn, type Recurrence } from "@/lib/game/recurrence";

describe("recurrence", () => {
  it("daily with interval", () => {
    const r: Recurrence = { freq: "daily", interval: 2, start: "2026-10-01" };
    expect(occurrencesBetween(r, "2026-10-01", "2026-10-09")).toEqual(["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-07", "2026-10-09"]);
  });
  it("never produces dates before the start or after 'until'", () => {
    const r: Recurrence = { freq: "daily", start: "2026-10-05", until: "2026-10-07" };
    expect(occurrencesBetween(r, "2026-10-01", "2026-10-31")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });
  it("weekly on chosen weekdays", () => {
    const r: Recurrence = { freq: "weekly", weekdays: [1, 3, 5], start: "2026-10-05" };
    expect(occurrencesBetween(r, "2026-10-05", "2026-10-16")).toEqual(["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16"]);
  });
  it("weekly defaults to the start date's weekday and honours every-N-weeks", () => {
    const r: Recurrence = { freq: "weekly", interval: 2, start: "2026-10-07" }; // a Wednesday
    expect(occurrencesBetween(r, "2026-10-01", "2026-11-10")).toEqual(["2026-10-07", "2026-10-21", "2026-11-04"]);
  });
  it("monthly clamps to the last day of short months", () => {
    const r: Recurrence = { freq: "monthly", monthday: 31, start: "2026-01-31" };
    expect(occurrencesBetween(r, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("monthly every 3 months", () => {
    const r: Recurrence = { freq: "monthly", interval: 3, start: "2026-01-15" };
    expect(occurrencesBetween(r, "2026-01-01", "2026-12-31")).toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
  });
  it("occursOn agrees with occurrencesBetween across a long range", () => {
    const r: Recurrence = { freq: "weekly", weekdays: [2, 6], interval: 3, start: "2026-02-03" };
    const list = new Set(occurrencesBetween(r, "2026-02-03", "2026-12-31"));
    for (let i = 0, d = "2026-02-03"; i < 330; i++) {
      const [y, m, dd] = d.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, dd + 1));
      d = dt.toISOString().slice(0, 10);
      expect(occursOn(r, d)).toBe(list.has(d));
    }
  });
  it("describes rules in words", () => {
    expect(describeRecurrence({ freq: "daily", start: "2026-01-01" })).toBe("Every day");
    expect(describeRecurrence({ freq: "weekly", weekdays: [1, 4], start: "2026-01-05" })).toBe("Every week on Mon, Thu");
    expect(describeRecurrence({ freq: "monthly", interval: 2, monthday: 5, start: "2026-01-05" })).toBe("Every 2 months on day 5");
  });
});
