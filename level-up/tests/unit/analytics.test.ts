import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { buildInsights, completionRate, funnel, incomeSummary, timeByDomain, xpSeries, type XpRow } from "@/lib/game/analytics";
import { est1RM, newPersonalRecords, personalRecords, revisionsDue, summariseMetric, syllabusProgress, trainingLoadWarning, weightTrend, type SyllabusNode } from "@/lib/game/domain";

const today = "2026-10-09";
const d = (n: number) => addDays(today, -n);

describe("aggregations", () => {
  it("builds a zero-filled XP series by day and domain", () => {
    const rows: XpRow[] = [{ day: d(1), category: "dev", xp: 25 }, { day: d(1), category: "dev", xp: 10 }, { day: today, category: "health", xp: 50 }];
    const s = xpSeries(rows, d(2), today);
    expect(s.map((p) => p.total)).toEqual([0, 35, 50]);
    expect(s[1].dev).toBe(35);
  });
  it("completion rate ignores skipped/discarded quests and future days", () => {
    const tasks = [
      { status: "done", scheduled_date: d(1) }, { status: "open", scheduled_date: d(1) }, { status: "discarded", scheduled_date: d(1) },
      { status: "skipped", scheduled_date: d(2) }, { status: "open", scheduled_date: addDays(today, 3) },
    ];
    expect(completionRate(tasks, d(7), addDays(today, 7), today)).toEqual({ done: 1, planned: 2, rate: 0.5 });
    expect(completionRate([], d(7), today, today).rate).toBeNull();
  });
  it("sums only recorded minutes per domain", () => {
    const t = timeByDomain({
      focus: [{ category: "college", session_date: d(1), minutes: 50 }, { category: "dev", session_date: d(1), minutes: 90 }, { category: "dev", session_date: d(40), minutes: 500 }],
      practice: [{ session_date: d(2), duration_min: 60, status: "done" }, { session_date: d(2), duration_min: 45, status: "planned" }],
      workouts: [{ workout_date: d(3), duration_min: 55 }], mobility: [{ day: d(3), mobility_min: 10 }],
    }, d(6), today);
    expect(t).toEqual({ basketball: 60, college: 50, dev: 90, health: 65 });
  });
  it("only reports funnel rates when there is enough data", () => {
    expect(funnel([{ status: "contacted" }, { status: "won" }]).replyRate).toBeNull();
    const f = funnel([...Array(4).fill({ status: "contacted" }), { status: "replied" }, { status: "meeting" }, { status: "won" }, { status: "lost" }, { status: "lost" }]);
    expect(f.replyRate).toBeCloseTo(3 / 9);
    expect(f.winRate).toBeCloseTo(1 / 3);
  });
  it("keeps invoiced, received and outstanding separate and never mixes currencies", () => {
    const recs = [
      { id: "i1", kind: "invoice" as const, amount: 10000, currency: "INR", occurred_on: d(10), invoice_id: null },
      { id: "p1", kind: "payment" as const, amount: 4000, currency: "INR", occurred_on: d(5), invoice_id: "i1" },
      { id: "p2", kind: "payment" as const, amount: 1500, currency: "INR", occurred_on: d(2), invoice_id: null },
      { id: "i2", kind: "invoice" as const, amount: 200, currency: "USD", occurred_on: d(3), invoice_id: null },
    ];
    const s = incomeSummary(recs);
    expect(s.find((x) => x.currency === "INR")).toEqual({ currency: "INR", invoiced: 10000, received: 5500, outstanding: 6000 });
    expect(s.find((x) => x.currency === "USD")).toEqual({ currency: "USD", invoiced: 200, received: 0, outstanding: 200 });
  });
  it("learning hours never become money: no records means no income", () => {
    expect(incomeSummary([])).toEqual([]);
  });
});

describe("insights are honest", () => {
  const base = { today, restDates: [], lastActivity: {} as any };
  it("refuses to draw conclusions from too little history", () => {
    const i = buildInsights({ ...base, xpRows: [], activeDates: [today, d(1)] });
    expect(i).toHaveLength(1);
    expect(i[0].id).toBe("need-data");
  });
  it("flags a neglected domain with the numbers behind it", () => {
    const xpRows: XpRow[] = [];
    const active: string[] = [];
    for (let n = 0; n < 14; n++) { active.push(d(n)); xpRows.push({ day: d(n), category: "dev", xp: 25 }, { day: d(n), category: "college", xp: 25 }); }
    xpRows.push({ day: d(3), category: "basketball", xp: 10 });
    const i = buildInsights({ ...base, xpRows, activeDates: active });
    const hit = i.find((x) => x.id === "neglect-basketball");
    expect(hit?.text).toMatch(/Basketball received 1% of your XP/);
    expect(hit?.basis).toBe("recorded");
    expect(i.find((x) => x.id === "neglect-dev")).toBeUndefined();
  });
  it("reports an improving trend only with two full weeks of history", () => {
    const week2 = [d(7), d(8)], week1 = [d(0), d(1), d(2), d(3), d(4)];
    const full = buildInsights({ ...base, xpRows: [], activeDates: [...week1, ...week2, d(13)] });
    expect(full.find((x) => x.id === "trend-up")).toBeTruthy();
    const short = buildInsights({ ...base, xpRows: [], activeDates: [d(0), d(1), d(2), d(3), d(4), d(5)] });
    expect(short.find((x) => x.id.startsWith("trend"))).toBeUndefined();
  });
  it("notices a domain that has gone quiet", () => {
    const active = Array.from({ length: 8 }, (_, n) => d(n));
    const i = buildInsights({ ...base, xpRows: [], activeDates: active, lastActivity: { basketball: d(9) } });
    expect(i.find((x) => x.id === "quiet-basketball")?.text).toMatch(/9 days/);
  });
});

describe("domain helpers", () => {
  it("summarises shooting by day and ignores days with too few attempts for 'best'", () => {
    const metric = { id: "ft", name: "Free throws", kind: "shooting" as const, direction: "higher" as const, unit: null };
    const logs = [
      { metric_id: "ft", logged_on: d(3), attempts: 50, makes: 35, value: null },
      { metric_id: "ft", logged_on: d(2), attempts: 10, makes: 10, value: null }, // too few attempts to count as a best
      { metric_id: "ft", logged_on: d(1), attempts: 30, makes: 24, value: null },
      { metric_id: "ft", logged_on: d(1), attempts: 20, makes: 16, value: null }, // same day: aggregated 40/50
    ];
    const s = summariseMetric(metric, logs);
    expect(s.series.map((p) => Math.round(p.value))).toEqual([70, 80]);
    expect(s.best?.day).toBe(d(1));
    expect(s.totalAttempts).toBe(110);
  });
  it("respects 'lower is better' value metrics (e.g. sprint time)", () => {
    const m = { id: "s", name: "Lane sprint", kind: "value" as const, direction: "lower" as const, unit: "s" };
    const s = summariseMetric(m, [{ metric_id: "s", logged_on: d(5), attempts: null, makes: null, value: 4.2 }, { metric_id: "s", logged_on: d(1), attempts: null, makes: null, value: 3.9 }]);
    expect(s.best?.value).toBe(3.9);
  });
  it("estimates 1RM with Epley and finds PRs only against earlier history", () => {
    expect(est1RM(100, 1)).toBe(100);
    expect(est1RM(100, 5)).toBeCloseTo(116.67, 1);
    const history = [{ exercise: "Squat", reps: 5, weight_kg: 100 }];
    expect(newPersonalRecords(history, [{ exercise: "Squat", reps: 5, weight_kg: 105 }])).toEqual(["Squat"]);
    expect(newPersonalRecords(history, [{ exercise: "Squat", reps: 5, weight_kg: 95 }])).toEqual([]);
    expect(newPersonalRecords([], [{ exercise: "Bench", reps: 5, weight_kg: 60 }])).toEqual([]); // first time is a baseline, not a PR
    const rec = personalRecords([...history, { exercise: "squat", reps: 3, weight_kg: 120 }]);
    expect(rec).toHaveLength(1);
    expect(rec[0].maxWeight).toBe(120);
  });
  it("only reports a bodyweight trend with enough points over enough time", () => {
    expect(weightTrend([{ day: d(2), value: 70 }, { day: d(1), value: 70.1 }], today)).toBeNull();
    const pts = [28, 21, 14, 7, 0].map((n, i) => ({ day: d(n), value: 70 + i * 0.25 }));
    expect(weightTrend(pts, today)!.perWeek).toBeCloseTo(0.25, 2);
  });
  it("advises rest after a long unbroken training run (and never rewards more)", () => {
    const days = Array.from({ length: 6 }, (_, n) => d(n));
    expect(trainingLoadWarning(days, [], today)).toMatch(/rest day/);
    expect(trainingLoadWarning(days.slice(0, 3), [], today)).toBeNull();
  });
  it("tracks syllabus progress by leaf topics and schedules spaced revisions", () => {
    const n = (id: string, parent: string | null, status: SyllabusNode["status"], rev = 0, next: string | null = null): SyllabusNode =>
      ({ id, subject_id: "s", parent_id: parent, kind: "topic", title: id, status, sort_order: 0, revision_count: rev, next_revision_on: next, last_revised_on: null });
    const nodes = [n("u1", null, "todo"), n("a", "u1", "done", 1, d(1)), n("b", "u1", "learning"), n("c", "u1", "done", 0, addDays(today, 3))];
    const p = syllabusProgress(nodes);
    expect(p).toMatchObject({ done: 2, total: 3, revised: 1 });
    expect(revisionsDue(nodes, today).map((x) => x.id)).toEqual(["a"]);
  });
});
