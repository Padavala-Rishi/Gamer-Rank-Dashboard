// Optional demo data: a computer-science student / aspiring software engineer.
// Everything is created through the validated repository layer with is_demo = 1,
// so it can be removed in one click without touching the user's real data.
import type { DB } from "./db";
import { nowIso } from "./db";
import { create, type Ctx } from "./repo";
import { R } from "./resources";
import { addDays, weekday, zonedToUtc } from "../shared/dates";

type Row = Record<string, unknown>;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function loadDemoData(db: DB, ctx: Ctx): void {
  const c = { ...ctx, isDemo: true };
  const T = ctx.today;
  const rand = rng(42);
  const pick = <X>(arr: X[]) => arr[Math.floor(rand() * arr.length)];
  const mk = (table: string, data: Row) => create(c, R[table], data);
  const setCol = (table: string, id: unknown, col: string, val: unknown) => db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ? AND user_id = ?`).run(val, id, ctx.userId);
  const at = (date: string, time: string) => zonedToUtc(date, time, ctx.tz);

  const areas = new Map((db.prepare("SELECT id, name FROM life_areas WHERE user_id = ?").all(ctx.userId) as { id: string; name: string }[]).map((a) => [a.name, a.id]));
  const area = (n: string) => areas.get(n) ?? null;

  // Vision & values
  db.prepare(
    `INSERT INTO visions (user_id, identity, ideal_life, what_matters, non_negotiables, success_definition, regrets, current_reality, constraints, is_demo, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(user_id) DO NOTHING`,
  ).run(
    ctx.userId,
    "A calm, capable software engineer who keeps promises to himself, stays healthy, and makes time for the people he loves.",
    "Meaningful engineering work with a strong team, financial breathing room, a fit body, and evenings that aren't consumed by a phone.",
    "Health, family, craftsmanship, learning, freedom.",
    "Sleep before midnight on weeknights. Sunday lunch with family. Never cheat on exams or at work.",
    "Being proud of how I spend an ordinary Tuesday.",
    "Not taking my health seriously while young. Not building things of my own.",
    "Final-year CS student. Good at coding, inconsistent at studying theory. Spending too long on YouTube at night.",
    "Classes 9–4 on weekdays, limited budget, shared room at home.",
    nowIso(),
  );
  const vals = ["Health", "Craftsmanship", "Family", "Curiosity", "Freedom"].map((name, i) =>
    mk("personal_values", { name, sort_order: i, description: { Health: "Energy is the foundation for everything else.", Craftsmanship: "Do fewer things, do them properly.", Family: "Show up for the people who showed up for me.", Curiosity: "Understand how things work.", Freedom: "Enough savings and skills to choose my path." }[name] }),
  );
  const vid = (n: string) => vals.find((v) => v.name === n)!.id as string;
  db.prepare("UPDATE life_areas SET focus = 'attention' WHERE user_id = ? AND name IN ('Physical Health','Education & Learning','Career & Skills')").run(ctx.userId);

  // Goals (hierarchy)
  const gCareer = mk("goals", { title: "Become a backend software engineer at a product company", horizon: "long_term", kind: "outcome", life_area_id: area("Career & Skills"), why: "Work I enjoy, financial freedom, and a team to grow with.", start_date: addDays(T, -60), deadline: addDays(T, 540), value_ids: [vid("Craftsmanship"), vid("Freedom")], progress_mode: "milestones" });
  const gJob = mk("goals", { title: "Land a backend internship or graduate role", parent_id: gCareer.id, horizon: "year", life_area_id: area("Career & Skills"), why: "The first step into the industry.", start_date: addDays(T, -60), deadline: addDays(T, 150), is_focus: true, progress_mode: "milestones", value_ids: [vid("Freedom")] });
  const gExam = mk("goals", { title: "Score 8.5+ CGPA this semester", horizon: "quarter", life_area_id: area("Education & Learning"), why: "Keeps doors open for good companies and a master's.", start_date: addDays(T, -45), deadline: addDays(T, 50), is_focus: true, progress_mode: "manual", manual_progress: 45, value_ids: [vid("Curiosity")] });
  const gFit = mk("goals", { title: "Run 5 km under 28 minutes", horizon: "quarter", kind: "outcome", life_area_id: area("Physical Health"), why: "I want energy that lasts the whole day.", start_date: addDays(T, -40), deadline: addDays(T, 45), progress_mode: "metric", metric_name: "5 km time", metric_unit: "min", metric_start: 36, metric_current: 31.5, metric_target: 28, value_ids: [vid("Health")] });
  const gSave = mk("goals", { title: "Build a ₹60,000 emergency fund", horizon: "year", life_area_id: area("Finance"), why: "So a surprise doesn't become a crisis.", start_date: addDays(T, -90), deadline: addDays(T, 200), progress_mode: "manual", manual_progress: 38, value_ids: [vid("Freedom")] });
  const gRead = mk("goals", { title: "Read 12 books this year", horizon: "year", kind: "process", life_area_id: area("Personal Growth"), start_date: addDays(T, -270), deadline: addDays(T, 95), progress_mode: "metric", metric_name: "Books", metric_start: 0, metric_current: 7, metric_target: 12, value_ids: [vid("Curiosity")] });
  mk("goals", { title: "Weekly call with grandparents", horizon: "month", kind: "process", life_area_id: area("Relationships"), progress_mode: "manual", manual_progress: 75, value_ids: [vid("Family")] });

  const ms = [
    [gJob.id, "Portfolio project deployed with tests and docs", -10, true],
    [gJob.id, "Solve 150 DSA problems", 20, false],
    [gJob.id, "Resume reviewed by two engineers", 30, false],
    [gJob.id, "Apply to 25 companies", 60, false],
    [gJob.id, "Complete 5 mock interviews", 90, false],
    [gCareer.id, "Land first backend role", 150, false],
    [gCareer.id, "Ship a production service end-to-end", 400, false],
  ] as const;
  ms.forEach(([gid, title, d, done], i) => {
    const m = mk("milestones", { goal_id: gid, title, due_date: addDays(T, d), sort_order: i });
    if (done) setCol("milestones", m.id, "completed_at", at(addDays(T, d), "18:00"));
  });

  // Projects & tasks
  const pPortfolio = mk("projects", { title: "Portfolio: URL shortener API", goal_id: gJob.id, life_area_id: area("Career & Skills"), status: "active", start_date: addDays(T, -30), deadline: addDays(T, 12), description: "Go + Postgres service with rate limiting, tests, and a short write-up." });
  const pDsa = mk("projects", { title: "DSA interview prep", goal_id: gJob.id, life_area_id: area("Career & Skills"), status: "active", start_date: addDays(T, -50) });
  const pSem = mk("projects", { title: "Semester coursework", goal_id: gExam.id, life_area_id: area("Education & Learning"), status: "active", deadline: addDays(T, 50) });
  const pRoom = mk("projects", { title: "Set up a distraction-free study corner", life_area_id: area("Personal Growth"), status: "planned" });

  const task = (d: Row) => mk("tasks", d);
  const t1 = task({ title: "Write integration tests for the redirect endpoint", project_id: pPortfolio.id, priority: "high", due_date: addDays(T, 1), estimate_min: 90, energy: "high", first_step: "Open redirect_test.go and write the first failing test name" });
  const t2 = task({ title: "Add Redis-based rate limiting", project_id: pPortfolio.id, priority: "medium", due_date: addDays(T, 5), estimate_min: 120, energy: "high", depends_on: [t1.id] });
  task({ title: "Write README with architecture diagram", project_id: pPortfolio.id, priority: "medium", due_date: addDays(T, 9), estimate_min: 60, energy: "medium", depends_on: [t2.id] });
  task({ title: "Deploy to Fly.io with CI", project_id: pPortfolio.id, priority: "medium", due_date: addDays(T, 11), estimate_min: 90 });
  task({ title: "Revise Computer Networks Unit 2 (transport layer)", project_id: pSem.id, priority: "critical", due_date: T, estimate_min: 60, energy: "medium", mit_date: T, first_step: "Open your notes and read the TCP handshake diagram" });
  task({ title: "Submit TOC assignment 3 (pumping lemma)", project_id: pSem.id, priority: "high", due_date: addDays(T, 2), estimate_min: 75, energy: "high", first_step: "Read the first question and write what you're asked to prove" });
  task({ title: "Solve 3 medium graph problems", project_id: pDsa.id, priority: "high", scheduled_date: T, estimate_min: 75, energy: "high", recurrence: "weekdays", due_date: T });
  task({ title: "Review mistakes log from last week's contest", project_id: pDsa.id, priority: "medium", estimate_min: 30, energy: "low" });
  task({ title: "Email Prof. Rao about project guide", priority: "medium", due_date: addDays(T, -2), estimate_min: 10, energy: "low", context: "email", life_area_id: area("Education & Learning") });
  task({ title: "Renew bus pass", priority: "low", due_date: addDays(T, 3), estimate_min: 20, context: "errands", energy: "low" });
  task({ title: "Buy a desk lamp and a phone stand", project_id: pRoom.id, priority: "low", estimate_min: 45, context: "errands" });
  task({ title: "Declutter desk and move phone charger out of reach", project_id: pRoom.id, priority: "medium", estimate_min: 30, energy: "low" });
  task({ title: "Pay electricity bill", priority: "high", due_date: addDays(T, -1), estimate_min: 5, context: "phone", life_area_id: area("Finance"), recurrence: "monthly:5" });
  task({ title: "Plan birthday surprise for Ananya", priority: "medium", due_date: addDays(T, 8), estimate_min: 30, life_area_id: area("Relationships") });
  const done = [
    ["Set up project skeleton and CI", pPortfolio.id, "high", -20],
    ["Implement shortening endpoint", pPortfolio.id, "high", -14],
    ["Read chapter 3 of DDIA", null, "medium", -9],
    ["Finish OS lab 6", pSem.id, "high", -6],
    ["Solve 3 medium tree problems", pDsa.id, "high", -3],
    ["Call bank about student account", null, "low", -2],
    ["Write redirect handler", pPortfolio.id, "high", -1],
  ] as const;
  for (const [title, pid, priority, d] of done) {
    const t = task({ title, project_id: pid, priority, status: "done", estimate_min: 60, actual_min: 70 });
    setCol("tasks", t.id, "completed_at", at(addDays(T, d), "17:30"));
  }
  // Extra completed tasks spread over the last 60 days for analytics.
  for (let i = 60; i >= 1; i--) {
    const n = Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const t = task({ title: pick(["Lecture notes cleanup", "Practice problems", "Code review for friend", "Lab record", "Reply to emails", "Grocery run", "Leetcode daily"]), priority: pick(["medium", "medium", "low", "high"]), status: "done", estimate_min: 30 });
      setCol("tasks", t.id, "completed_at", at(addDays(T, -i), `${10 + Math.floor(rand() * 9)}:15`));
    }
  }

  // Habits with history
  const habits = [
    mk("habits", { title: "Study Python / DSA", frequency: "daily", minimum_value: 10, target_value: 60, unit: "minutes", goal_id: gJob.id, life_area_id: area("Career & Skills"), cue: "After dinner, at the desk" }),
    mk("habits", { title: "Run or walk", frequency: "days", days: [1, 3, 5, 6], minimum_value: 10, target_value: 30, unit: "minutes", goal_id: gFit.id, life_area_id: area("Physical Health"), cue: "6:30am, shoes by the door" }),
    mk("habits", { title: "Read", frequency: "daily", minimum_value: 2, target_value: 20, unit: "pages", goal_id: gRead.id, life_area_id: area("Personal Growth"), cue: "In bed, phone in the other room" }),
    mk("habits", { title: "Journal before sleep", frequency: "daily", minimum_value: 1, target_value: 5, unit: "minutes", life_area_id: area("Mind & Wellbeing") }),
    mk("habits", { title: "Call family", frequency: "weekly", times_per_week: 2, life_area_id: area("Relationships") }),
  ];
  const rates = [0.8, 0.7, 0.65, 0.5, 0.8];
  habits.forEach((h, hi) => {
    setCol("habits", h.id, "created_at", at(addDays(T, -62), "08:00"));
    for (let i = 60; i >= 1; i--) {
      const d = addDays(T, -i);
      if (h.frequency === "days" && !(h.days as number[]).includes(weekday(d))) continue;
      if (h.frequency === "weekly" && rand() > 0.3) continue;
      const r = rand();
      const recent = i < 12 ? 0.12 : 0;
      if (r < rates[hi] + recent) mk("habit_logs", { habit_id: h.id, date: d, status: rand() < 0.2 ? "minimum" : "done", value: h.target_value ?? null });
      else if (r < rates[hi] + recent + 0.06) mk("habit_logs", { habit_id: h.id, date: d, status: "skipped", note: "Rest day" });
    }
  });

  // Daily check-ins, workouts, screen time
  for (let i = 45; i >= 0; i--) {
    const d = addDays(T, -i);
    if (i > 0 && rand() < 0.12) continue;
    const sleep = Math.round((5.6 + rand() * 2.6) * 2) / 2;
    const exercised = rand() < 0.45;
    const mood = Math.max(1, Math.min(5, Math.round(2.4 + (sleep - 6) * 0.6 + (exercised ? 0.6 : 0) + rand() * 1.4)));
    mk("checkins", {
      entry_date: d,
      sleep_hours: sleep,
      sleep_quality: Math.max(1, Math.min(5, Math.round(sleep - 3.5 + rand()))),
      mood,
      energy: Math.max(1, Math.min(5, Math.round(mood - 0.5 + rand()))),
      stress: Math.max(1, Math.min(5, Math.round(3.8 - mood * 0.4 + rand() * 1.5 + (i < 10 ? 0.5 : 0)))),
      nutrition: 2 + Math.floor(rand() * 3),
      steps: 3000 + Math.floor(rand() * 8000),
      water_glasses: 4 + Math.floor(rand() * 5),
      screen_min: 120 + Math.floor(rand() * 240),
      rest_day: weekday(d) === 0,
      emotions: [pick(["focused", "tired", "hopeful", "anxious", "calm", "restless", "grateful"])],
    });
    if (exercised && i > 0) mk("workouts", { occurred_on: d, kind: pick(["cardio", "cardio", "strength", "walk", "mobility"]), duration_min: 20 + Math.floor(rand() * 40), intensity: pick(["easy", "moderate", "hard"]) });
  }

  // Learning
  const cn = mk("subjects", { title: "Computer Networks", kind: "subject", goal_id: gExam.id, life_area_id: area("Education & Learning"), color: "#3f73a8", weekly_target_min: 240 });
  const toc = mk("subjects", { title: "Theory of Computation", kind: "subject", goal_id: gExam.id, life_area_id: area("Education & Learning"), color: "#7a6aa8", weekly_target_min: 240 });
  const dsa = mk("subjects", { title: "Data Structures & Algorithms", kind: "course", provider: "Self-paced", goal_id: gJob.id, life_area_id: area("Career & Skills"), color: "#4f8a6e", weekly_target_min: 300 });
  const topics: Record<string, Row[]> = {};
  const addTopics = (s: Row, list: [string, number][]) => (topics[s.id as string] = list.map(([title, mastery], i) => mk("topics", { subject_id: s.id, title, mastery, sort_order: i })));
  addTopics(cn, [["Unit 1: Physical & data link layer", 3], ["Unit 2: Transport layer (TCP/UDP)", 1], ["Unit 3: Network layer & routing", 1], ["Unit 4: Application layer", 0], ["Unit 5: Security basics", 0]]);
  addTopics(toc, [["Finite automata", 3], ["Regular expressions", 2], ["Pumping lemma", 1], ["Context-free grammars", 0], ["Turing machines", 0]]);
  addTopics(dsa, [["Arrays & hashing", 4], ["Two pointers & sliding window", 3], ["Trees", 3], ["Graphs (BFS/DFS)", 2], ["Dynamic programming", 1]]);
  mk("learning_resources", { subject_id: cn.id, title: "Kurose & Ross — Computer Networking", kind: "book", status: "in_progress" });
  mk("learning_resources", { subject_id: toc.id, title: "Sipser — Introduction to the Theory of Computation", kind: "book", status: "in_progress" });
  mk("learning_resources", { subject_id: dsa.id, title: "NeetCode 150", kind: "practice", url: "https://neetcode.io", status: "in_progress" });
  const cards: [Row, string, string][] = [
    [cn, "What are the three steps of the TCP handshake?", "SYN → SYN-ACK → ACK"],
    [cn, "Difference between TCP and UDP?", "TCP: connection-oriented, reliable, ordered. UDP: connectionless, best-effort, low overhead."],
    [cn, "What does the sliding window control?", "How much unacknowledged data can be in flight (flow control)."],
    [toc, "State the pumping lemma for regular languages.", "For regular L there is p such that any s∈L with |s|≥p splits as xyz, |xy|≤p, |y|>0, and xyⁱz∈L for all i≥0."],
    [toc, "Is {aⁿbⁿ | n≥0} regular?", "No — pumping lemma contradiction."],
    [dsa, "Time complexity of BFS?", "O(V + E)"],
    [dsa, "When to use a monotonic stack?", "Next greater/smaller element style problems."],
    [dsa, "Dijkstra fails with…", "Negative edge weights."],
  ];
  for (const [s, front, back] of cards) mk("flashcards", { subject_id: s.id, front, back });
  mk("assessments", { subject_id: cn.id, title: "CN mid-semester exam", kind: "exam", due_date: addDays(T, 6), due_time: "10:00", weight: 30 });
  mk("assessments", { subject_id: toc.id, title: "TOC assignment 3", kind: "assignment", due_date: addDays(T, 2), weight: 10 });
  mk("assessments", { subject_id: toc.id, title: "TOC quiz 1", kind: "quiz", due_date: addDays(T, -12), status: "graded", score: 17, max_score: 20, weight: 10 });

  // Focus sessions & distractions over the last 30 days
  const subjectsArr = [cn, toc, dsa];
  for (let i = 30; i >= 1; i--) {
    const d = addDays(T, -i);
    const n = rand() < 0.2 ? 0 : 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const s = pick(subjectsArr);
      const planned = pick([25, 25, 50, 90]);
      const actual = Math.max(10, Math.round(planned * (0.7 + rand() * 0.35)));
      const start = at(d, `${pick(["07", "10", "14", "16", "20", "21"])}:${pick(["00", "15", "30"])}`);
      const session = mk("focus_sessions", {
        kind: s.id === dsa.id ? "deep_work" : "study",
        objective: `${s.title}: ${pick(["practice problems", "revise notes", "read chapter", "flashcards", "past paper"])}`,
        subject_id: s.id,
        planned_min: planned,
        started_at: start,
        ended_at: new Date(Date.parse(start) + actual * 60000).toISOString(),
        actual_min: actual,
        status: rand() < 0.9 ? "completed" : "abandoned",
        quality: 2 + Math.floor(rand() * 4),
        accomplished: pick(["Finished the problem set", "Covered two subtopics", "Got stuck but understood the idea", "Solid session"]),
      });
      if (rand() < 0.5) mk("distractions", { session_id: session.id, kind: pick(["phone", "phone", "youtube", "messaging", "thoughts", "social"]), occurred_at: new Date(Date.parse(start) + 10 * 60000).toISOString() });
    }
  }

  // Skills
  const sGo = mk("skills", { title: "Go", domain: "career", category: "Languages", current_level: 2, target_level: 4, goal_id: gJob.id });
  const sSql = mk("skills", { title: "SQL & PostgreSQL", domain: "career", category: "Data", current_level: 2, target_level: 4, goal_id: gJob.id });
  const sSys = mk("skills", { title: "System design", domain: "career", category: "Architecture", current_level: 1, target_level: 3, goal_id: gCareer.id, prerequisite_ids: [sSql.id] });
  const sDsa = mk("skills", { title: "Algorithms & data structures", domain: "career", category: "Fundamentals", current_level: 3, target_level: 4, goal_id: gJob.id });
  mk("skills", { title: "Docker & deployment", domain: "career", category: "DevOps", current_level: 1, target_level: 3, goal_id: gJob.id, prerequisite_ids: [sGo.id] });
  mk("skills", { title: "Public speaking", domain: "personal", category: "Communication", current_level: 1, target_level: 3 });
  mk("skills", { title: "Emotional regulation", domain: "personal", category: "Self-awareness", current_level: 2, target_level: 4 });
  mk("skill_evidence", { skill_id: sGo.id, kind: "project", title: "URL shortener API (in progress)", occurred_on: addDays(T, -10), minutes: 600 });
  mk("skill_evidence", { skill_id: sDsa.id, kind: "practice", title: "Weekly contest #412 — 3/4 solved", occurred_on: addDays(T, -5), minutes: 90 });
  mk("skill_evidence", { skill_id: sSql.id, kind: "certification", title: "SQL (Intermediate) — HackerRank", occurred_on: addDays(T, -40) });
  mk("skill_evidence", { skill_id: sSys.id, kind: "resource", title: "DDIA chapters 1–3", occurred_on: addDays(T, -9), minutes: 240 });

  // People & relationships
  const people = [
    mk("people", { name: "Amma & Appa", relation: "family", contact_every_days: 3, important: true, notes: "Sunday lunch together." }),
    mk("people", { name: "Grandparents", relation: "family", contact_every_days: 7, important: true, birthday: `--${addDays(T, 5).slice(5)}` }),
    mk("people", { name: "Ananya", relation: "friend", contact_every_days: 7, important: true, birthday: `2003-${addDays(T, 9).slice(5)}`, follow_up: "Ask how her interview went" }),
    mk("people", { name: "Rahul", relation: "friend", contact_every_days: 14 }),
    mk("people", { name: "Priya (senior at Razorpay)", relation: "mentor", contact_every_days: 30, how_to_reach: "LinkedIn", follow_up: "Share portfolio once deployed; ask for resume review" }),
  ];
  const ints: [number, number, string][] = [[0, -1, "in_person"], [0, -4, "call"], [1, -12, "call"], [2, -9, "message"], [3, -20, "in_person"], [4, -41, "message"]];
  for (const [pi, d, kind] of ints) mk("interactions", { person_id: people[pi].id, occurred_on: addDays(T, d), kind, note: kind === "call" ? "Caught up" : null });
  mk("applications", { company: "Razorpay", role: "Backend Intern", status: "applied", applied_on: addDays(T, -6), next_step: "Online assessment", next_step_on: addDays(T, 4), person_id: people[4].id });
  mk("applications", { company: "Zerodha", role: "Graduate Engineer", status: "wishlist", next_step: "Finish portfolio first" });
  mk("applications", { company: "Postman", role: "SDE Intern", status: "rejected", applied_on: addDays(T, -35), notes: "No response to follow-up. Ask Priya for feedback on resume." });

  // Finance
  const bank = mk("financial_accounts", { name: "SBI Savings", kind: "savings", opening_balance: 18500 });
  const wallet = mk("financial_accounts", { name: "Cash & UPI", kind: "cash", opening_balance: 1200 });
  const fund = mk("financial_accounts", { name: "Emergency fund (RD)", kind: "savings", opening_balance: 19000 });
  mk("financial_accounts", { name: "Education loan", kind: "loan", opening_balance: 85000 });
  for (let m = 2; m >= 0; m--) {
    const base = addDays(T, -30 * m);
    const d0 = base.slice(0, 8) + "01";
    if (d0 <= T) {
      mk("transactions", { account_id: bank.id, kind: "income", amount: 15000, occurred_on: d0, category: "Freelance", note: "Web project for local shop" });
      mk("transactions", { account_id: bank.id, kind: "income", amount: 5000, occurred_on: d0, category: "Allowance" });
      mk("transactions", { account_id: bank.id, to_account_id: fund.id, kind: "transfer", amount: 3000, occurred_on: d0, note: "Monthly RD" });
    }
    for (let k = 0; k < 14; k++) {
      const d = addDays(d0, Math.floor(rand() * 28));
      if (d > T) continue;
      const cat = pick(["Food", "Food", "Transport", "Shopping", "Entertainment", "Education", "Subscriptions"]);
      mk("transactions", { account_id: pick([bank.id, wallet.id]), kind: "expense", amount: Math.round(80 + rand() * (cat === "Shopping" ? 2500 : 700)), occurred_on: d, category: cat });
    }
  }
  for (const [category, limit] of [["Food", 4000], ["Transport", 1500], ["Entertainment", 1200], ["Shopping", 2500]] as const) mk("budgets", { category, monthly_limit: limit });
  mk("subscriptions", { name: "Spotify", amount: 119, cycle: "monthly", next_renewal: addDays(T, 12), category: "Entertainment" });
  mk("subscriptions", { name: "YouTube Premium", amount: 129, cycle: "monthly", next_renewal: addDays(T, 3), category: "Entertainment" });
  mk("subscriptions", { name: "GitHub Copilot (student)", amount: 0, cycle: "monthly", category: "Education" });
  mk("subscriptions", { name: "Domain name", amount: 950, cycle: "yearly", next_renewal: addDays(T, 140), category: "Education" });
  mk("financial_goals", { title: "Emergency fund", kind: "emergency", target_amount: 60000, account_id: fund.id, monthly_contribution: 3000, deadline: addDays(T, 200), goal_id: gSave.id });
  mk("financial_goals", { title: "New laptop", kind: "purchase", target_amount: 75000, current_amount: 21000, monthly_contribution: 4000, deadline: addDays(T, 300) });

  // Journal & decisions
  mk("journal_entries", { kind: "daily", entry_date: addDays(T, -1), mood: 4, answers: { "What went well?": "Finished the redirect handler; went for a run.", "What went badly?": "Lost an hour to YouTube after dinner.", "What did I learn?": "Writing the test first made the handler simpler.", "What am I avoiding?": "The TOC assignment.", "What matters tomorrow?": "CN Unit 2 revision and integration tests.", "What should I change?": "Phone charges in the kitchen." } });
  mk("journal_entries", { kind: "gratitude", entry_date: addDays(T, -2), mood: 4, answers: { "Three things I'm grateful for": "Amma's cooking, a cool evening run, Rahul's help with the bug." } });
  mk("journal_entries", { kind: "checkin", entry_date: addDays(T, -3), mood: 2, answers: { "What am I feeling?": "Anxious about placements.", "What is affecting me?": "Friends getting offers.", "What do I need?": "A clear plan and some sleep.", "What can I control?": "Daily practice and applications.", "What should I let go of?": "Comparing my timeline to others." } });
  mk("journal_entries", { kind: "lessons", entry_date: addDays(T, -8), answers: { "What happened?": "Crammed the night before the OS quiz.", "What did it teach me?": "Spaced reviews beat one long session.", "How will I apply it?": "Flashcards for CN and TOC, 15 min daily." } });
  const dec = mk("decisions", { title: "Focus on backend (Go) instead of full-stack for placements", decided_on: addDays(T, -35), context: "Limited time before placement season.", options: "1) Full-stack with React + Node\n2) Backend with Go + Postgres\n3) Stay generalist", chosen: "Backend with Go + Postgres", reasoning: "More differentiated, matches the companies I like, and I enjoy it more.", assumptions: "Backend roles exist for freshers at my target companies.", risks: "Fewer openings than full-stack.", expected_outcome: "Stronger portfolio and 3+ interview calls within 2 months.", confidence: 70, review_on: addDays(T, 5), life_area_id: area("Career & Skills") });
  void dec;

  // Notes
  const n1 = mk("notes", { title: "TCP congestion control", folder: "Computer Networks", body: "## Key ideas\n- **Slow start**: cwnd doubles each RTT until ssthresh\n- **Congestion avoidance**: additive increase\n- **Fast retransmit** after 3 duplicate ACKs\n\nSee also [[Interview prep checklist]].", tags: ["networks", "exam"], links: [{ entity_type: "subject", entity_id: cn.id as string }] });
  mk("notes", { title: "Interview prep checklist", folder: "Career", body: "1. Two-minute intro\n2. Project deep-dive (URL shortener)\n3. DSA patterns list\n4. Questions to ask the interviewer\n\nRelated: [[TCP congestion control]]", tags: ["career"], pinned: true, links: [{ entity_type: "goal", entity_id: gJob.id as string }] });
  mk("notes", { title: "Idea: habit tracker CLI in Go", folder: "Ideas", body: "Small side project to practise Go + SQLite.", tags: ["idea"] });
  void n1;

  // Calendar: classes, gym, deep work
  const monday = (() => {
    let d = addDays(T, -7);
    while (weekday(d) !== 1) d = addDays(d, 1);
    return d;
  })();
  mk("calendar_events", { title: "Classes", kind: "study", start_at: at(monday, "09:00"), end_at: at(monday, "13:00"), recurrence: "weekdays", location: "College" });
  mk("calendar_events", { title: "Lab", kind: "study", start_at: at(addDays(monday, 1), "14:00"), end_at: at(addDays(monday, 1), "16:00"), recurrence: "weekly", location: "CS Lab 2" });
  mk("calendar_events", { title: "Lunch", kind: "meal", start_at: at(monday, "13:00"), end_at: at(monday, "13:45"), recurrence: "daily" });
  mk("calendar_events", { title: "Deep work: portfolio", kind: "focus", start_at: at(T, "16:30"), end_at: at(T, "18:00"), task_id: t1.id });
  mk("calendar_events", { title: "Run", kind: "exercise", start_at: at(addDays(T, 1), "06:30"), end_at: at(addDays(T, 1), "07:15") });
  mk("calendar_events", { title: "Mock interview with Priya", kind: "meeting", start_at: at(addDays(T, 3), "19:00"), end_at: at(addDays(T, 3), "20:00") });

  // Custom metric & environment
  const m = mk("metrics", { name: "Resting heart rate", unit: "bpm", kind: "number", direction: "lower", target: 60, life_area_id: area("Physical Health") });
  for (let i = 28; i >= 0; i -= 4) mk("metric_entries", { metric_id: m.id, entry_date: addDays(T, -i), value: 72 - Math.round((28 - i) / 5) + Math.round(rand() * 2) });
  mk("environment_checks", { area: "notifications", checked_on: addDays(T, -6), rating: 2, note: "Instagram and WhatsApp pings during study.", change_idea: "Focus mode 9pm–11pm" });
  mk("environment_checks", { area: "workspace", checked_on: addDays(T, -6), rating: 3, note: "Desk cluttered, shared room.", change_idea: "Declutter; headphones" });
  mk("environment_checks", { area: "sleep", checked_on: addDays(T, -6), rating: 2, note: "Phone in bed.", change_idea: "Charge phone in kitchen" });
}
