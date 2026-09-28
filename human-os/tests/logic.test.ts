import { describe, it, expect } from "vitest";
import { addDays, addMonths, diffDays, isValidDate, startOfWeek, tzOffsetMinutes, zonedToUtc, dateInTz, minutesInTz, endOfQuarter } from "../shared/dates";
import { nextOccurrence, nextDueAfterCompletion } from "../shared/recurrence";
import { review } from "../shared/sm2";
import { habitStats } from "../shared/habits";
import { goalPace, goalProgress, type GoalLike } from "../shared/goals";
import { buildDailyPlan, rankTasks, recommendNow, type PlanTask } from "../shared/planner";
import { parseCapture } from "../shared/capture";
import { expandEvents, findConflicts, dayCapacity, freeSlots } from "../shared/calendar";
import { projectGoal, monthlyEquivalent } from "../shared/finance";

describe("dates", () => {
  it("validates calendar dates strictly", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("26-01-01")).toBe(false);
  });
  it("does calendar arithmetic across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(diffDays("2026-03-01", "2026-02-01")).toBe(-28);
    expect(startOfWeek("2026-09-27", 1)).toBe("2026-09-21"); // Sunday → previous Monday
    expect(endOfQuarter("2026-08-15")).toBe("2026-09-30");
  });
  it("converts wall-clock time to UTC, including across DST", () => {
    expect(zonedToUtc("2026-09-28", "09:00", "Asia/Kolkata")).toBe("2026-09-28T03:30:00.000Z");
    // New York: EDT (UTC-4) in July, EST (UTC-5) in December
    expect(zonedToUtc("2026-07-01", "09:00", "America/New_York")).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "America/New_York")).toBe("2026-12-01T14:00:00.000Z");
    expect(tzOffsetMinutes(new Date("2026-06-01T00:00:00Z"), "Asia/Kolkata")).toBe(330);
    const iso = zonedToUtc("2026-03-08", "10:30", "America/New_York"); // DST starts that morning
    expect(dateInTz(iso, "America/New_York")).toBe("2026-03-08");
    expect(minutesInTz(iso, "America/New_York")).toBe(630);
  });
});

describe("recurrence", () => {
  it("computes next occurrences", () => {
    expect(nextOccurrence("daily", "2026-09-28")).toBe("2026-09-29");
    expect(nextOccurrence("weekdays", "2026-10-02")).toBe("2026-10-05"); // Fri → Mon
    expect(nextOccurrence("weekly:1,3", "2026-09-28")).toBe("2026-09-30");
    expect(nextOccurrence("monthly:31", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence("monthly:15", "2026-01-10")).toBe("2026-01-15");
    expect(nextOccurrence("every:3", "2026-09-28")).toBe("2026-10-01");
  });
  it("never schedules the next instance in the past when completed late", () => {
    expect(nextDueAfterCompletion("daily", "2026-09-20", "2026-09-28")).toBe("2026-09-29");
    expect(nextDueAfterCompletion("weekly:5", "2026-10-02", "2026-09-30")).toBe("2026-10-09"); // done early keeps cadence
    expect(nextDueAfterCompletion("daily", null, "2026-09-28")).toBe("2026-09-29");
  });
});

describe("spaced repetition (SM-2)", () => {
  it("grows intervals on success and resets on failure", () => {
    let c = { ease: 2.5, interval_days: 0, repetitions: 0, lapses: 0 };
    const r1 = review(c, 4, "2026-09-28");
    expect(r1.interval_days).toBe(1);
    const r2 = review(r1, 4, "2026-09-29");
    expect(r2.interval_days).toBe(3);
    const r3 = review(r2, 4, "2026-10-02");
    expect(r3.interval_days).toBeGreaterThan(6);
    const fail = review(r3, 1, "2026-10-10");
    expect(fail.interval_days).toBe(1);
    expect(fail.repetitions).toBe(0);
    expect(fail.lapses).toBe(1);
    expect(fail.ease).toBeGreaterThanOrEqual(1.3);
    c = { ease: 1.3, interval_days: 1, repetitions: 0, lapses: 5 };
    expect(review(c, 0, "2026-01-01").ease).toBe(1.3);
  });
});

describe("habit streaks", () => {
  const today = "2026-09-28"; // Monday
  const daily = { frequency: "daily", days: [], times_per_week: null, created_at: "2026-09-01T00:00:00Z" };
  it("counts minimum versions, treats skips as neutral and today as pending", () => {
    const logs = [
      { date: "2026-09-27", status: "done" },
      { date: "2026-09-26", status: "skipped" },
      { date: "2026-09-25", status: "minimum" },
      { date: "2026-09-24", status: "done" },
      { date: "2026-09-22", status: "done" }, // 23rd missed → streak stops
    ];
    const s = habitStats(daily, logs, today);
    expect(s.currentStreak).toBe(3);
    expect(s.minimum30).toBe(1);
    expect(s.todayStatus).toBeNull();
  });
  it("only schedules specific days", () => {
    const h = { frequency: "days", days: [1, 3, 5], times_per_week: null, created_at: "2026-09-01T00:00:00Z" };
    const logs = [{ date: "2026-09-25", status: "done" }, { date: "2026-09-23", status: "done" }, { date: "2026-09-21", status: "done" }];
    const s = habitStats(h, logs, today);
    expect(s.currentStreak).toBe(3);
    expect(s.scheduledToday).toBe(true);
  });
  it("tracks weekly targets in weeks", () => {
    const h = { frequency: "weekly", days: [], times_per_week: 2, created_at: "2026-09-01T00:00:00Z" };
    const logs = [{ date: "2026-09-22", status: "done" }, { date: "2026-09-24", status: "done" }, { date: "2026-09-15", status: "done" }, { date: "2026-09-17", status: "minimum" }];
    const s = habitStats(h, logs, today, 1);
    expect(s.streakUnit).toBe("weeks");
    expect(s.currentStreak).toBe(2);
    expect(s.weekProgress).toEqual({ done: 0, target: 2 });
  });
});

describe("goals", () => {
  const g: GoalLike = { id: "g", status: "active", progress_mode: "metric", metric_start: 36, metric_current: 31.5, metric_target: 28, manual_progress: null, start_date: "2026-09-01", deadline: "2026-12-01", created_at: "2026-09-01T00:00:00Z" };
  const none = { milestonesDone: 0, milestonesTotal: 0, tasksDone: 0, tasksTotal: 0, childProgress: [] };
  it("measures decreasing metrics correctly", () => {
    expect(goalProgress(g, none)).toBeCloseTo(4.5 / 8);
  });
  it("blends milestones with sub-goal progress", () => {
    const m = { ...g, progress_mode: "milestones" };
    expect(goalProgress(m, { ...none, milestonesDone: 1, milestonesTotal: 4, childProgress: [0.75] })).toBeCloseTo(0.5);
    expect(goalProgress(m, { ...none, childProgress: [0.2] })).toBeCloseTo(0.2);
    expect(goalProgress(m, none)).toBeNull();
  });
  it("judges pace relative to elapsed time", () => {
    expect(goalPace(g, 0.1, "2026-11-01").pace).toBe("behind");
    expect(goalPace(g, 0.7, "2026-11-01").pace).toBe("on_track");
    expect(goalPace(g, 0.5, "2026-12-02").pace).toBe("overdue");
    expect(goalPace({ ...g, deadline: null }, 0.5, "2026-11-01").pace).toBe("no_deadline");
  });
});

const task = (over: Partial<PlanTask>): PlanTask => ({ id: Math.random().toString(36).slice(2), title: "t", status: "todo", priority: "medium", due_date: null, due_time: null, scheduled_date: null, mit_date: null, estimate_min: 30, energy: null, context: null, first_step: null, snoozed_until: null, goal_id: null, parent_id: null, ...over });

describe("planner", () => {
  const today = "2026-09-28";
  it("ranks overdue and critical work first and skips blocked or deferred tasks", () => {
    const r = rankTasks([task({ title: "low" , priority: "low" }), task({ title: "overdue", due_date: "2026-09-25" }), task({ title: "blocked", priority: "critical", blocked: true }), task({ title: "later", scheduled_date: "2026-10-05", priority: "critical" })], today);
    expect(r.map((x) => x.task.title)).toEqual(["overdue", "low"]);
    expect(r[0].reasons.join(" ")).toMatch(/Overdue by 3 days/);
  });
  it("never proposes more than 3 MITs and flags overload honestly", () => {
    const tasks = Array.from({ length: 15 }, (_, i) => task({ title: `t${i}`, priority: "high", due_date: today, estimate_min: 60 }));
    const plan = buildDailyPlan(rankTasks(tasks, today), { today, energy: null, usableMin: 240, freeMin: 360, busyMin: 120, hasFocusGoal: false, activeSubjects: [], exercisedToday: true, restDay: false, stress: null, habitsDue: [], peopleToContact: [], flashcardsDue: 0 });
    expect(plan.mits.length).toBe(3);
    expect(plan.committedMin).toBeLessThanOrEqual(240);
    expect(plan.overflow.length).toBeGreaterThan(0);
    expect(plan.overloaded).toBe(true);
    expect(plan.warnings.some((w) => w.includes("due today or overdue but won't fit"))).toBe(true);
  });
  it("recommends one action with reasons, and short windows get short actions", () => {
    const ranked = rankTasks([task({ title: "Big essay", priority: "high", estimate_min: 120, first_step: "Open the doc" })], today);
    const base = { today, nowIso: "2026-09-28T06:00:00Z", nextCommitment: { title: "Class", startsInMin: 10 }, energy: null, stress: null, runningSession: null, checkinDone: true, isEvening: false, habitsDue: [], flashcardsDue: 0, exercisedToday: true, restDay: false, personToContact: null, exclude: new Set<string>() };
    const r = recommendNow(ranked, { ...base, availableMin: 10 });
    expect(r.primary?.action).toBe("Open the doc");
    expect(r.primary!.minutes).toBeLessThanOrEqual(10);
    const skip = recommendNow(ranked, { ...base, availableMin: 10, exclude: new Set([r.primary!.key]) });
    expect(skip.primary?.key).not.toBe(r.primary!.key);
  });
});

describe("quick capture parsing", () => {
  const today = "2026-09-28"; // Monday
  it("extracts dates, times and priority", () => {
    expect(parseCapture("Call mom tomorrow 6pm !high", today)).toEqual({ title: "Call mom", date: "2026-09-29", time: "18:00", priority: "high" });
    expect(parseCapture("Submit form friday", today).date).toBe("2026-10-02");
    expect(parseCapture("Review in 2 weeks", today).date).toBe("2026-10-12");
    expect(parseCapture("Standup at 09:30 p1", today)).toMatchObject({ title: "Standup", time: "09:30", priority: "critical" });
    expect(parseCapture("Just a thought", today)).toEqual({ title: "Just a thought", date: null, time: null, priority: null });
  });
});

describe("calendar", () => {
  const tz = "Asia/Kolkata";
  const ev = (id: string, start: string, end: string, recurrence = "none") => ({ id, title: id, kind: "meeting", start_at: zonedToUtc("2026-09-28", start, tz), end_at: zonedToUtc("2026-09-28", end, tz), all_day: false, recurrence, recurrence_until: null });
  it("expands weekday recurrences at the same wall-clock time", () => {
    const occ = expandEvents([ev("class", "09:00", "13:00", "weekdays")], "2026-09-28", "2026-10-04", tz);
    expect(occ.map((o) => o.occurrence_date)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(minutesInTz(occ[3].start_at, tz)).toBe(9 * 60);
  });
  it("detects overlaps and computes realistic capacity", () => {
    const occ = expandEvents([ev("a", "10:00", "11:00"), ev("b", "10:30", "12:00"), ev("c", "12:00", "13:00")], "2026-09-28", "2026-09-28", tz);
    const c = findConflicts(occ);
    expect(c.length).toBe(1);
    expect(c[0].overlapMin).toBe(30);
    const cap = dayCapacity(occ, "2026-09-28", tz, "08:00", "18:00");
    expect(cap.busyMin).toBe(180);
    expect(cap.freeMin).toBe(420);
    expect(cap.usableMin).toBe(294);
    expect(freeSlots([{ start: 600, end: 660 }], 540, 720)).toEqual([{ start: 540, end: 600 }, { start: 660, end: 720 }]);
  });
});

describe("finance", () => {
  it("projects gap, timeline and required contribution", () => {
    const p = projectGoal(60000, 22000, 3000, "2027-04-01", "2026-09-28");
    expect(p.gap).toBe(38000);
    expect(p.monthsToGoal).toBe(13);
    expect(p.onTrack).toBe(false);
    expect(p.requiredMonthly).toBeGreaterThan(3000);
    expect(projectGoal(100, 150, null, null, "2026-09-28").progress).toBe(1);
    expect(monthlyEquivalent(1200, "yearly")).toBe(100);
  });
});
