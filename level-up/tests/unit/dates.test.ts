import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysInMonth, diffDays, endOfMonth, formatMinutes, isoWeekday, isValidTimeZone, isYMD, localDateOf, relativeDay, todayIn, weekStart } from "@/lib/dates";

describe("dates", () => {
  it("adds and diffs days across month, year and leap boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-01", "2026-10-09")).toBe(8);
    expect(diffDays("2026-10-09", "2026-10-01")).toBe(-8);
  });

  it("is immune to daylight-saving shifts", () => {
    // US spring-forward and fall-back weekends
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(diffDays("2026-03-01", "2026-04-01")).toBe(31);
    expect(diffDays("2026-10-25", "2026-11-02")).toBe(8);
  });

  it("computes ISO weekdays and week starts", () => {
    expect(isoWeekday("2026-10-09")).toBe(5); // Friday
    expect(isoWeekday("2026-10-11")).toBe(7); // Sunday
    expect(weekStart("2026-10-09")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
    expect(weekStart("2026-10-11", 0)).toBe("2026-10-11");
    expect(weekStart("2026-10-10", 0)).toBe("2026-10-04");
  });

  it("handles months", () => {
    expect(daysInMonth("2026-02-10")).toBe(28);
    expect(daysInMonth("2028-02-10")).toBe(29);
    expect(endOfMonth("2026-04-15")).toBe("2026-04-30");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-01");
    expect(addMonths("2026-01-15", -2)).toBe("2025-11-01");
  });

  it("validates date strings strictly", () => {
    expect(isYMD("2026-02-29")).toBe(false);
    expect(isYMD("2028-02-29")).toBe(true);
    expect(isYMD("2026-13-01")).toBe(false);
    expect(isYMD("tomorrow")).toBe(false);
  });

  it("decides 'today' in the user's own time zone (the midnight boundary)", () => {
    const instant = new Date("2026-10-09T20:30:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-10-09");
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-10-10");        // 02:00 next day in IST
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-09"); // 13:30 same day
    expect(todayIn("Pacific/Auckland", instant)).toBe("2026-10-10");
    // an instant a minute either side of local midnight in Kolkata
    expect(localDateOf("2026-10-09T18:29:00Z", "Asia/Kolkata")).toBe("2026-10-09");
    expect(localDateOf("2026-10-09T18:30:00Z", "Asia/Kolkata")).toBe("2026-10-10");
  });

  it("labels days relative to today", () => {
    expect(relativeDay("2026-10-09", "2026-10-09")).toBe("Today");
    expect(relativeDay("2026-10-10", "2026-10-09")).toBe("Tomorrow");
    expect(relativeDay("2026-10-08", "2026-10-09")).toBe("Yesterday");
    expect(relativeDay("2026-10-12", "2026-10-09")).toBe("Monday");
  });

  it("formats durations and validates zones", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(135)).toBe("2h 15m");
    expect(formatMinutes(null)).toBe("—");
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("deterministic date formatting (must not depend on the runtime's ICU data)", () => {
  it("formats days the same everywhere", async () => {
    const { formatDay, formatMonth, formatTimestamp } = await import("@/lib/dates");
    expect(formatDay("2026-10-25")).toBe("Sun 25 Oct");
    expect(formatDay("2026-10-09", { day: "numeric", month: "short" })).toBe("9 Oct");
    expect(formatDay("2026-10-12", { weekday: "long" })).toBe("Monday");
    expect(formatDay("2026-10-09", { weekday: "long", day: "numeric", month: "long" })).toBe("Friday, 9 October");
    expect(formatDay("2027-01-03", { day: "numeric", month: "short", year: "numeric" })).toBe("3 Jan 2027");
    expect(formatMonth("2026-02-14")).toBe("February 2026");
    expect(formatTimestamp("2026-10-09T20:30:00Z", "Asia/Kolkata")).toBe("10 Oct, 02:00");
    expect(formatTimestamp("2026-10-09T00:05:00Z", "UTC")).toBe("9 Oct, 00:05");
  });
});
