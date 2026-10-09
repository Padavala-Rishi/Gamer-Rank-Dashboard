import { describe, expect, it } from "vitest";
import { bucketTasks, checkSchedule, dayLoad, nextBestActions, nextOccurrences, pickMinimumViableDay, recommendedWorkload, visibleNow, type PlannerSettings, type PlannerTask } from "@/lib/game/planner";

const today = "2026-10-09"; // Friday
const settings: PlannerSettings = { availability: { mon: 180, tue: 180, wed: 180, thu: 180, fri: 180, sat: 300, sun: 240 }, daily_task_limit: 6, mvd_minutes: 60 };
let n = 0;
const T = (o: Partial<PlannerTask> = {}): PlannerTask => ({ id: `t${n++}`, title: "Quest", category: "dev", difficulty: "easy", priority: 2, est_minutes: 30, scheduled_date: today, status: "open", ...o });

describe("schedule limits", () => {
  it("accepts quests inside the recommended load (80% of free time)", () => {
    const c = checkSchedule({ tasks: [T(), T()], date: today, addMinutes: 30, settings });
    expect(c.verdict).toBe("ok");
    expect(c.recommendedMinutes).toBe(144);
  });
  it("warns when the day gets full but still fits in the free time", () => {
    const c = checkSchedule({ tasks: [T({ est_minutes: 60 }), T({ est_minutes: 60 })], date: today, addMinutes: 30, settings });
    expect(c.verdict).toBe("full");
    expect(c.message).toMatch(/fills the day/);
  });
  it("blocks plans beyond 115% of the free time, with a better day suggested", () => {
    const tasks = [T({ est_minutes: 90 }), T({ est_minutes: 90 })];
    const c = checkSchedule({ tasks, date: today, addMinutes: 60, settings });
    expect(c.verdict).toBe("blocked");
    expect(c.suggestedDate).toBe("2026-10-10");
  });
  it("blocks dozens of tiny quests via the daily task limit", () => {
    const tasks = Array.from({ length: 6 }, () => T({ est_minutes: 5 }));
    const c = checkSchedule({ tasks, date: today, addMinutes: 5, settings });
    expect(c.verdict).toBe("blocked");
    expect(c.message).toMatch(/limit is 6/);
  });
  it("counts quests without an estimate as 30 minutes and says how many were guessed", () => {
    const l = dayLoad([T({ est_minutes: null }), T({ est_minutes: 20 })], today);
    expect(l).toEqual({ count: 2, minutes: 50, estimatedCount: 1 });
  });
  it("ignores the quest being moved when re-checking a day", () => {
    const moving = T({ est_minutes: 100 });
    const c = checkSchedule({ tasks: [moving], date: today, addMinutes: 100, settings, ignoreId: moving.id });
    expect(c.after.count).toBe(1);
  });
  it("only counts open quests on that exact day", () => {
    const l = dayLoad([T({ status: "done" }), T({ status: "discarded" }), T({ scheduled_date: "2026-10-10" }), T()], today);
    expect(l.count).toBe(1);
  });
  it("recommends a smaller workload in Minimum Viable Day mode", () => {
    const full = recommendedWorkload(today, settings);
    const mvd = recommendedWorkload(today, settings, true);
    expect(mvd.minutes).toBeLessThan(full.minutes);
    expect(mvd.tasks).toBeLessThanOrEqual(3);
  });
});

describe("Minimum Viable Day", () => {
  it("picks at most three quests within the time budget, favouring variety and priority", () => {
    const tasks = [
      T({ id: "a", category: "dev", priority: 1, est_minutes: 30 }),
      T({ id: "b", category: "dev", priority: 1, est_minutes: 20 }),
      T({ id: "c", category: "health", priority: 2, est_minutes: 10, quest_type: "recovery" }),
      T({ id: "d", category: "college", priority: 2, est_minutes: 90 }),
      T({ id: "e", category: "basketball", priority: 3, est_minutes: 15 }),
    ];
    const picked = pickMinimumViableDay(tasks, today, settings);
    expect(picked.length).toBeLessThanOrEqual(3);
    expect(picked.reduce((a, t) => a + (t.est_minutes ?? 30), 0)).toBeLessThanOrEqual(60);
    expect(new Set(picked.map((t) => t.category)).size).toBe(picked.length);
    // one of the two high-priority dev quests is chosen (the shorter one), not both: variety first
    expect(picked.filter((t) => t.priority === 1)).toHaveLength(1);
  });
  it("never picks future or finished quests", () => {
    const picked = pickMinimumViableDay([T({ scheduled_date: "2026-10-12" }), T({ status: "done" })], today, settings);
    expect(picked).toEqual([]);
  });
});

describe("Next Best Action", () => {
  it("prefers an exam-linked quest when the exam is close", () => {
    const study = T({ id: "study", category: "college", subject_id: "s1" });
    const gym = T({ id: "gym", category: "health", priority: 1 });
    const [top] = nextBestActions([gym, study], { today, exams: [{ id: "e", subject_id: "s1", title: "Maths exam", exam_date: "2026-10-12", status: "upcoming" }] });
    expect(top.task.id).toBe("study");
    expect(top.reasons.join(" ")).toMatch(/Maths exam is in 3 days/);
  });
  it("surfaces carried-over quests above fresh ones but explains why", () => {
    const old = T({ id: "old", scheduled_date: "2026-10-06" });
    const fresh = T({ id: "fresh" });
    const [top] = nextBestActions([fresh, old], { today });
    expect(top.task.id).toBe("old");
    expect(top.reasons[0]).toMatch(/3 days ago/);
  });
  it("does not treat missed repeating-habit instances as urgent", () => {
    const missed = T({ id: "m", scheduled_date: "2026-10-06", template_id: "tpl" });
    const fresh = T({ id: "fresh" });
    expect(nextBestActions([missed, fresh], { today })[0].task.id).toBe("fresh");
  });
  it("only nudges a neglected area when there is enough recorded activity to say so", () => {
    const hoop = T({ id: "hoop", category: "basketball" });
    const code = T({ id: "code", category: "dev" });
    const few = nextBestActions([hoop, code], { today, recentXp: { dev: 20 } });
    expect(few.find((r) => r.task.id === "hoop")!.reasons.join()).not.toMatch(/little attention/);
    const many = nextBestActions([hoop, code], { today, recentXp: { dev: 200, college: 100, health: 80, basketball: 0 } });
    expect(many[0].task.id).toBe("hoop");
    expect(many[0].reasons.join()).toMatch(/little attention/);
  });
  it("skips future quests, finished quests and parents with open sub-quests", () => {
    const parent = T({ id: "p", difficulty: "boss" });
    const child = T({ id: "c", parent_id: "p" });
    const recs = nextBestActions([parent, child, T({ scheduled_date: "2026-10-20" }), T({ status: "done" })], { today, openChildren: new Set(["p"]) });
    expect(recs.map((r) => r.task.id)).toEqual(["c"]);
  });
  it("returns nothing when there is nothing to do", () => {
    expect(nextBestActions([], { today })).toEqual([]);
  });
});

describe("bucketing", () => {
  it("separates today, overdue, upcoming and backlog; missed habit instances are not 'overdue'", () => {
    const b = bucketTasks([
      T({ id: "t" }), T({ id: "o", scheduled_date: "2026-10-05" }), T({ id: "m", scheduled_date: "2026-10-05", template_id: "x" }),
      T({ id: "u", scheduled_date: "2026-10-11" }), T({ id: "b", scheduled_date: null }), T({ id: "d", status: "done" }),
    ], today);
    expect(b.today.map((x) => x.id)).toEqual(["t"]);
    expect(b.overdue.map((x) => x.id)).toEqual(["o"]);
    expect(b.upcoming.map((x) => x.id)).toEqual(["u"]);
    expect(b.backlog.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("repeating quests in lists", () => {
  it("hides future copies of a repeating quest, but never one-off quests", () => {
    const list = [T({ id: "a", scheduled_date: "2026-10-10", template_id: "tpl" }), T({ id: "b", scheduled_date: "2026-10-10" }), T({ id: "c", scheduled_date: today, template_id: "tpl" })];
    expect(visibleNow(list, today).map((t) => t.id)).toEqual(["b", "c"]);
  });
  it("coming-up shows only the next occurrence of each repeating quest", () => {
    const list = [T({ id: "r3", scheduled_date: "2026-10-12", template_id: "tpl" }), T({ id: "r1", scheduled_date: "2026-10-10", template_id: "tpl" }), T({ id: "x", scheduled_date: "2026-10-11" }), T({ id: "r2", scheduled_date: "2026-10-11", template_id: "tpl" })];
    expect(nextOccurrences(list).map((t) => t.id)).toEqual(["r1", "x"]);
  });
});
