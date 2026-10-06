import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { openDatabase, type DB } from "../server/db";
import { createApp } from "../server/app";
import { todayIn, addDays } from "../shared/dates";

let db: DB;
let app: ReturnType<typeof createApp>;

async function signup(email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ email, password: "correct horse battery", timezone: "Asia/Kolkata" });
  expect(res.status).toBe(201);
  return agent;
}

beforeAll(() => {
  db = openDatabase(":memory:");
  app = createApp(db, { production: false, authAttemptsPer15Min: 1000 });
});

describe("auth", () => {
  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/r/tasks");
    expect(res.status).toBe(401);
  });

  it("registers, reports the session and seeds defaults", async () => {
    const a = await signup("auth@example.com");
    const me = await a.get("/api/auth/me");
    expect(me.body.user.email).toBe("auth@example.com");
    const areas = await a.get("/api/r/life-areas");
    expect(areas.body.length).toBe(8);
    const profile = await a.get("/api/profile");
    expect(profile.body.timezone).toBe("Asia/Kolkata");
    expect(profile.body.onboarded).toBe(false);
  });

  it("starts new accounts in the simple view", async () => {
    const a = await signup("simple@example.com");
    const p = (await a.get("/api/profile")).body;
    expect(p.dashboard_widgets).toEqual(["now", "priorities", "habits", "schedule"]);
    expect(p.hidden_nav).toContain("/finance");
    expect(p.hidden_nav).not.toContain("/tasks");
    // One call switches to everything.
    const full = (await a.patch("/api/profile").send({ hidden_nav: [] })).body;
    expect(full.hidden_nav).toEqual([]);
  });

  it("rejects duplicate emails and weak passwords", async () => {
    await signup("dup@example.com");
    const dup = await request(app).post("/api/auth/register").send({ email: "DUP@example.com", password: "correct horse battery" });
    expect(dup.status).toBe(409);
    const weak = await request(app).post("/api/auth/register").send({ email: "weak@example.com", password: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.fields.password).toBeTruthy();
  });

  it("logs in and out; wrong password is rejected without leaking which part was wrong", async () => {
    await signup("login@example.com");
    const bad = await request(app).post("/api/auth/login").send({ email: "login@example.com", password: "nope-nope-nope" });
    expect(bad.status).toBe(401);
    const unknown = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "nope-nope-nope" });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe(bad.body.error);
    const agent = request.agent(app);
    const ok = await agent.post("/api/auth/login").send({ email: "login@example.com", password: "correct horse battery" });
    expect(ok.status).toBe(200);
    expect(String(ok.headers["set-cookie"])).toMatch(/HttpOnly/);
    await agent.post("/api/auth/logout");
    expect((await agent.get("/api/r/tasks")).status).toBe(401);
  });

  it("stores only hashed session tokens", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/login").send({ email: "login@example.com", password: "correct horse battery" });
    const token = decodeURIComponent(String(res.headers["set-cookie"]).match(/hos_session=([^;]+)/)![1]);
    const row = db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(token);
    expect(row).toBeUndefined();
  });
});

describe("security middleware", () => {
  it("blocks cross-origin writes and non-JSON bodies", async () => {
    const a = await signup("csrf@example.com");
    const cross = await a.post("/api/r/tasks").set("Origin", "https://evil.example").send({ title: "x" });
    expect(cross.status).toBe(403);
    const form = await a.post("/api/r/tasks").set("Content-Type", "application/x-www-form-urlencoded").send("title=x");
    expect(form.status).toBe(415);
  });
});

describe("authorization isolation", () => {
  it("prevents one user from reading, changing, deleting or linking another user's data", async () => {
    const alice = await signup("alice@example.com");
    const bob = await signup("bob@example.com");
    const goal = (await alice.post("/api/r/goals").send({ title: "Alice's private goal" })).body;
    const task = (await alice.post("/api/r/tasks").send({ title: "Alice's task", goal_id: goal.id })).body;
    expect(task.goal_id).toBe(goal.id);

    expect((await bob.get(`/api/r/tasks/${task.id}`)).status).toBe(404);
    expect((await bob.patch(`/api/r/tasks/${task.id}`).send({ title: "pwned" })).status).toBe(404);
    expect((await bob.delete(`/api/r/tasks/${task.id}`)).status).toBe(404);
    expect((await bob.get("/api/r/tasks")).body).toEqual([]);
    // Foreign keys pointing at another user's rows are rejected.
    const link = await bob.post("/api/r/tasks").send({ title: "sneaky", goal_id: goal.id });
    expect(link.status).toBe(400);
    const dep = await bob.post("/api/r/tasks").send({ title: "sneaky", depends_on: [task.id] });
    expect(dep.status).toBe(400);
    const note = await bob.post("/api/r/notes").send({ title: "n", links: [{ entity_type: "goal", entity_id: goal.id }] });
    expect(note.status).toBe(400);
    const search = await bob.get("/api/search?q=Alice");
    expect(search.body).toEqual([]);
    const still = (await alice.get(`/api/r/tasks/${task.id}`)).body;
    expect(still.title).toBe("Alice's task");
  });
});

describe("domain rules", () => {
  it("validates input with field-level errors", async () => {
    const a = await signup("valid@example.com");
    const res = await a.post("/api/r/tasks").send({ title: "", due_date: "2026-02-30", priority: "urgent" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(["title", "due_date", "priority"]));
    const ev = await a.post("/api/r/events").send({ title: "x", start_at: "2026-01-01T10:00:00Z", end_at: "2026-01-01T09:00:00Z" });
    expect(ev.status).toBe(400);
  });

  it("completing a recurring task creates the next occurrence exactly once", async () => {
    const a = await signup("recur@example.com");
    const today = todayIn("Asia/Kolkata");
    const t = (await a.post("/api/r/tasks").send({ title: "Daily review", recurrence: "daily", due_date: today })).body;
    await a.patch(`/api/r/tasks/${t.id}`).send({ status: "done" });
    await a.patch(`/api/r/tasks/${t.id}`).send({ status: "todo" });
    await a.patch(`/api/r/tasks/${t.id}`).send({ status: "done" });
    const all = (await a.get("/api/r/tasks")).body;
    const open = all.filter((x: { status: string; title: string }) => x.title === "Daily review" && x.status === "todo");
    expect(open.length).toBe(1);
    expect(open[0].due_date).toBe(addDays(today, 1));
    expect(open[0].recurrence).toBe("daily");
  });

  it("rejects dependency and hierarchy cycles", async () => {
    const a = await signup("cycle@example.com");
    const t1 = (await a.post("/api/r/tasks").send({ title: "A" })).body;
    const t2 = (await a.post("/api/r/tasks").send({ title: "B", depends_on: [t1.id] })).body;
    const cyc = await a.patch(`/api/r/tasks/${t1.id}`).send({ depends_on: [t2.id] });
    expect(cyc.status).toBe(400);
    const g1 = (await a.post("/api/r/goals").send({ title: "Parent" })).body;
    const g2 = (await a.post("/api/r/goals").send({ title: "Child", parent_id: g1.id })).body;
    expect((await a.patch(`/api/r/goals/${g1.id}`).send({ parent_id: g2.id })).status).toBe(400);
  });

  it("marks tasks blocked by unfinished dependencies", async () => {
    const a = await signup("blocked@example.com");
    const t1 = (await a.post("/api/r/tasks").send({ title: "First" })).body;
    const t2 = (await a.post("/api/r/tasks").send({ title: "Second", depends_on: [t1.id] })).body;
    expect((await a.get(`/api/r/tasks/${t2.id}`)).body.blocked).toBe(true);
    await a.patch(`/api/r/tasks/${t1.id}`).send({ status: "done" });
    expect((await a.get(`/api/r/tasks/${t2.id}`)).body.blocked).toBe(false);
  });

  it("deleting a project keeps its tasks unless asked otherwise", async () => {
    const a = await signup("proj@example.com");
    const p = (await a.post("/api/r/projects").send({ title: "P" })).body;
    const t = (await a.post("/api/r/tasks").send({ title: "T", project_id: p.id })).body;
    await a.delete(`/api/r/projects/${p.id}`);
    expect((await a.get(`/api/r/tasks/${t.id}`)).body.project_id).toBeNull();
    const p2 = (await a.post("/api/r/projects").send({ title: "P2" })).body;
    const t2 = (await a.post("/api/r/tasks").send({ title: "T2", project_id: p2.id })).body;
    await a.delete(`/api/r/projects/${p2.id}?with_tasks=1`);
    expect((await a.get(`/api/r/tasks/${t2.id}`)).status).toBe(404);
  });

  it("habit logs upsert per day and reject future dates", async () => {
    const a = await signup("habit@example.com");
    const today = todayIn("Asia/Kolkata");
    const h = (await a.post("/api/r/habits").send({ title: "Read", minimum_value: 2, target_value: 20, unit: "pages" })).body;
    await a.post("/api/r/habit-logs").send({ habit_id: h.id, date: today, status: "minimum" });
    await a.post("/api/r/habit-logs").send({ habit_id: h.id, date: today, status: "done" });
    const logs = (await a.get(`/api/r/habit-logs?habit_id=${h.id}`)).body;
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe("done");
    expect((await a.post("/api/r/habit-logs").send({ habit_id: h.id, date: addDays(today, 1), status: "done" })).status).toBe(400);
    const bad = await a.post("/api/r/habits").send({ title: "x", minimum_value: 30, target_value: 10 });
    expect(bad.status).toBe(400);
  });

  it("quick capture parses natural language", async () => {
    const a = await signup("capture@example.com");
    const today = todayIn("Asia/Kolkata");
    const res = await a.post("/api/capture").send({ kind: "task", text: "Call mom tomorrow 6pm !high" });
    expect(res.status).toBe(201);
    expect(res.body.item.title).toBe("Call mom");
    expect(res.body.item.due_date).toBe(addDays(today, 1));
    expect(res.body.item.due_time).toBe("18:00");
    expect(res.body.item.priority).toBe("high");
  });

  it("focus sessions: only one running; finishing logs time on the task", async () => {
    const a = await signup("focus@example.com");
    const t = (await a.post("/api/r/tasks").send({ title: "Write essay" })).body;
    const s = (await a.post("/api/focus/start").send({ kind: "custom", planned_min: 30, task_id: t.id, objective: "Draft intro" })).body;
    expect((await a.get(`/api/r/tasks/${t.id}`)).body.status).toBe("doing");
    expect((await a.post("/api/focus/start").send({ planned_min: 25 })).status).toBe(409);
    await a.post("/api/r/distractions").send({ session_id: s.id, kind: "phone" });
    const done = await a.post(`/api/focus/${s.id}/finish`).send({ accomplished: "Intro drafted", quality: 4, actual_min: 0 });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("completed");
    expect((await a.post(`/api/focus/${s.id}/finish`).send({})).status).toBe(400);
  });

  it("flashcards follow spaced repetition", async () => {
    const a = await signup("cards@example.com");
    const today = todayIn("Asia/Kolkata");
    const c = (await a.post("/api/r/flashcards").send({ front: "Q", back: "A" })).body;
    expect(c.due_date).toBe(today);
    const r1 = (await a.post(`/api/flashcards/${c.id}/review`).send({ grade: 4 })).body;
    expect(r1.due_date).toBe(addDays(today, 1));
    const r2 = (await a.post(`/api/flashcards/${c.id}/review`).send({ grade: 4 })).body;
    expect(r2.interval_days).toBe(3);
    const r3 = (await a.post(`/api/flashcards/${c.id}/review`).send({ grade: 1 })).body;
    expect(r3.interval_days).toBe(1);
    expect(r3.lapses).toBe(1);
  });
});

describe("full workflow with demo data", () => {
  it("loads demo data and every insight endpoint responds", async () => {
    const a = await signup("demo@example.com");
    expect((await a.post("/api/demo")).status).toBe(200);
    expect((await a.post("/api/demo")).status).toBe(400);
    for (const url of [
      "/api/today",
      "/api/plan",
      "/api/next-action",
      "/api/analytics?range=7",
      "/api/analytics?range=365",
      "/api/reviews/stats?kind=weekly",
      "/api/reviews/stats?kind=quarterly",
      "/api/notifications",
      "/api/finance/summary",
      "/api/learning/overview",
      "/api/skills/overview",
      "/api/people/overview",
      "/api/goals/overview",
      "/api/habits/overview",
      "/api/calendar",
      "/api/focus/stats",
      "/api/compass",
      "/api/free-slots",
      "/api/ai/status",
      "/api/ai/context-preview",
    ]) {
      const res = await a.get(url);
      expect(res.status, url).toBe(200);
    }
    const today = (await a.get("/api/today")).body;
    expect(today.mits.length).toBeGreaterThan(0);
    const next = (await a.get("/api/next-action")).body;
    expect(next.primary).toBeTruthy();
    expect(next.primary.why.length).toBeGreaterThan(0);
    const plan = (await a.get("/api/plan")).body;
    expect(plan.plan.mits.length).toBeLessThanOrEqual(3);
    const audit = await a.post("/api/audits").send({ ratings: { health: { score: 4 }, career: { score: 6 }, finance: { score: 5 }, mind: { score: 7 } } });
    expect(audit.status).toBe(201);
    expect(audit.body.findings.next_actions.length).toBeGreaterThan(0);
    // AI is not configured in tests: clear 503, not a crash.
    expect((await a.post("/api/ai/chat").send({ message: "hi" })).status).toBe(503);
  });

  it("exports and re-imports into another account without id collisions", async () => {
    const a = await signup("exporter@example.com");
    await a.post("/api/demo");
    const exp = (await a.get("/api/export")).body;
    expect(exp.format).toBe("human-os-export");
    const b = await signup("importer@example.com");
    const imp = await b.post("/api/import").send(exp);
    expect(imp.status).toBe(200);
    const aTasks = (await a.get("/api/r/tasks")).body as { id: string }[];
    const bTasks = (await b.get("/api/r/tasks")).body as { id: string; project_id: string | null }[];
    expect(bTasks.length).toBe(aTasks.length);
    const aIds = new Set(aTasks.map((t) => t.id));
    expect(bTasks.some((t) => aIds.has(t.id))).toBe(false);
    const bProjects = new Set(((await b.get("/api/r/projects")).body as { id: string }[]).map((p) => p.id));
    expect(bTasks.filter((t) => t.project_id).every((t) => bProjects.has(t.project_id!))).toBe(true);
  });

  it("demo vision fills an empty vision but never overwrites the user's own", async () => {
    const a = await signup("vision-empty@example.com");
    await a.post("/api/onboarding").send({ display_name: "A", load_demo: true });
    expect((await a.get("/api/vision")).body.identity).toBeTruthy();
    const b = await signup("vision-own@example.com");
    await b.post("/api/onboarding").send({ identity: "My own words", load_demo: true });
    expect((await b.get("/api/vision")).body.identity).toBe("My own words");
  });

  it("removes demo data without touching real data", async () => {
    const a = await signup("cleanup@example.com");
    const mine = (await a.post("/api/r/tasks").send({ title: "My real task" })).body;
    await a.post("/api/demo");
    await a.delete("/api/demo");
    const tasks = (await a.get("/api/r/tasks")).body as { id: string }[];
    expect(tasks.map((t) => t.id)).toEqual([mine.id]);
    expect((await a.get("/api/r/goals")).body).toEqual([]);
  });

  it("deletes an account and all its data", async () => {
    const a = await signup("leaver@example.com");
    await a.post("/api/demo");
    const uid = (await a.get("/api/auth/me")).body.user.id;
    const res = await a.post("/api/auth/delete-account").send({ password: "correct horse battery", confirm: "DELETE" });
    expect(res.status).toBe(200);
    const left = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?").get(uid) as { n: number };
    expect(left.n).toBe(0);
  });
});
