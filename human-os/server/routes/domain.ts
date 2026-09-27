import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db";
import { nowIso } from "../db";
import { badRequest, HttpError, notFound } from "../http";
import { makeCtx } from "../crud";
import { create, get, list, update } from "../repo";
import { R } from "../resources";
import { addDays, addMonths, dateInTz, diffDays, eachDay, isValidDate, startOfMonth, startOfWeek, endOfMonth } from "../../shared/dates";
import { findConflicts, dayCapacity } from "../../shared/calendar";
import { review as sm2Review } from "../../shared/sm2";
import { monthlyEquivalent, projectGoal, round2 } from "../../shared/finance";
import { LIABILITY_KINDS } from "../../shared/constants";
import { parseCapture } from "../../shared/capture";
import { getProfile } from "../profile";
import { accountBalances, goalsWithProgress, habitsWithStats, occurrencesBetween, peopleToContact, upcomingBirthdays } from "../services";

type Row = Record<string, unknown>;

const dateQ = (v: unknown, fallback: string) => (isValidDate(v) ? (v as string) : fallback);

export function domainRouter(db: DB): Router {
  const r = Router();

  // ---------------------------------------------------------------- goals
  r.get("/goals/overview", (req, res) => {
    const ctx = makeCtx(db, req);
    res.json(goalsWithProgress(ctx));
  });

  // ---------------------------------------------------------------- habits
  r.get("/habits/overview", (req, res) => {
    const ctx = makeCtx(db, req);
    const days = Math.min(400, Math.max(7, Number(req.query.days) || 120));
    res.json(habitsWithStats(ctx, days));
  });

  // ---------------------------------------------------------------- calendar
  r.get("/calendar", (req, res) => {
    const ctx = makeCtx(db, req);
    const from = dateQ(req.query.from, startOfWeek(ctx.today));
    const to = dateQ(req.query.to, addDays(from, 6));
    if (diffDays(from, to) > 62 || to < from) throw badRequest("Range must be 0–62 days.");
    const profile = getProfile(db, ctx.userId);
    const occ = occurrencesBetween(ctx, from, to);
    const conflicts = findConflicts(occ);
    const tasks = list(ctx, R.tasks, { from, to, filters: { status: ["todo", "doing", "done"] } }).filter((t) => t.due_date);
    const days = eachDay(from, to).map((d) => {
      const dayOcc = occ.filter((o) => o.occurrence_date === d || (dateInTz(o.end_at, ctx.tz) >= d && o.occurrence_date < d));
      const cap = dayCapacity(dayOcc, d, ctx.tz, profile.day_start, profile.day_end);
      const scheduled = cap.busyMin;
      return {
        date: d,
        busy_min: scheduled,
        free_min: cap.freeMin,
        window_min: cap.windowMin,
        overbooked: cap.windowMin > 0 && scheduled / cap.windowMin > 0.85,
      };
    });
    res.json({ from, to, timezone: ctx.tz, events: occ, conflicts, tasks, days });
  });

  // ---------------------------------------------------------------- focus
  r.get("/focus/active", (req, res) => {
    const ctx = makeCtx(db, req);
    const s = list(ctx, R.focus_sessions, { filters: { status: "running" }, limit: 1 })[0] ?? null;
    res.json(s);
  });

  r.post("/focus/start", (req, res) => {
    const ctx = makeCtx(db, req);
    const running = list(ctx, R.focus_sessions, { filters: { status: "running" }, limit: 1 })[0];
    if (running) throw new HttpError(409, "A focus session is already running.", { session: running });
    const body = { ...(req.body ?? {}), status: "running", started_at: nowIso(), ended_at: null, actual_min: null };
    const session = create(ctx, R.focus_sessions, body);
    if (session.task_id) {
      const t = get(ctx, R.tasks, session.task_id as string);
      if (t.status === "todo") update(ctx, R.tasks, t.id as string, { status: "doing" });
    }
    res.status(201).json(session);
  });

  const finishSchema = z.object({
    status: z.enum(["completed", "abandoned"]).default("completed"),
    accomplished: z.string().max(2000).nullable().optional(),
    distraction_notes: z.string().max(2000).nullable().optional(),
    change_next: z.string().max(2000).nullable().optional(),
    quality: z.number().int().min(1).max(5).nullable().optional(),
    mark_task_done: z.boolean().optional(),
    topic_mastery: z.number().int().min(0).max(4).nullable().optional(),
    /** Minutes actually focused (excludes pauses); computed from wall time when omitted. */
    actual_min: z.number().int().min(0).max(1440).nullable().optional(),
  });

  r.post("/focus/:id/finish", (req, res) => {
    const ctx = makeCtx(db, req);
    const body = finishSchema.parse(req.body ?? {});
    const s = get(ctx, R.focus_sessions, req.params.id);
    if (s.status !== "running") throw badRequest("This session has already ended.");
    const endedAt = nowIso();
    const wall = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(s.started_at as string)) / 60000));
    const actual = Math.min(body.actual_min ?? wall, wall + 1);
    const updated = db.transaction(() => {
      const u = update(ctx, R.focus_sessions, s.id as string, {
        status: body.status,
        ended_at: endedAt,
        actual_min: actual,
        accomplished: body.accomplished ?? null,
        distraction_notes: body.distraction_notes ?? null,
        change_next: body.change_next ?? null,
        quality: body.quality ?? null,
      });
      if (s.task_id && actual > 0) {
        const t = get(ctx, R.tasks, s.task_id as string);
        update(ctx, R.tasks, t.id as string, { actual_min: ((t.actual_min as number) ?? 0) + actual, ...(body.mark_task_done ? { status: "done" } : {}) });
      }
      if (s.topic_id) {
        db.prepare("UPDATE topics SET last_studied = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(ctx.today, nowIso(), s.topic_id, ctx.userId);
        if (body.topic_mastery != null) update(ctx, R.topics, s.topic_id as string, { mastery: body.topic_mastery });
      }
      return u;
    })();
    res.json(updated);
  });

  r.get("/focus/stats", (req, res) => {
    const ctx = makeCtx(db, req);
    const from = dateQ(req.query.from, addDays(ctx.today, -29));
    const sessions = list(ctx, R.focus_sessions, { from, to: ctx.today }).filter((s) => s.status !== "running");
    const distractions = list(ctx, R.distractions, { from, to: ctx.today });
    const byKind: Record<string, number> = {};
    const byHour: Record<number, number> = {};
    for (const d of distractions) {
      byKind[d.kind as string] = (byKind[d.kind as string] ?? 0) + 1;
      byHour[d.local_hour as number] = (byHour[d.local_hour as number] ?? 0) + 1;
    }
    const completed = sessions.filter((s) => s.status === "completed");
    const total = completed.reduce((a, s) => a + ((s.actual_min as number) ?? 0), 0);
    const q = completed.filter((s) => s.quality != null);
    res.json({
      sessions: sessions.slice(0, 50),
      total_min: total,
      completed: completed.length,
      abandoned: sessions.length - completed.length,
      avg_quality: q.length ? round2(q.reduce((a, s) => a + (s.quality as number), 0) / q.length) : null,
      distractions_total: distractions.length,
      distractions_by_kind: byKind,
      distractions_by_hour: byHour,
      recent_distractions: distractions.slice(0, 20),
    });
  });

  // ---------------------------------------------------------------- learning
  r.get("/flashcards/due", (req, res) => {
    const ctx = makeCtx(db, req);
    const filters: Record<string, unknown> = {};
    if (typeof req.query.subject_id === "string") filters.subject_id = req.query.subject_id;
    const cards = list(ctx, R.flashcards, { filters, to: ctx.today, limit: 200 });
    res.json(cards);
  });

  r.post("/flashcards/:id/review", (req, res) => {
    const ctx = makeCtx(db, req);
    const { grade } = z.object({ grade: z.number().int().min(0).max(5) }).parse(req.body);
    const card = get(ctx, R.flashcards, req.params.id);
    const next = sm2Review(
      { ease: card.ease as number, interval_days: card.interval_days as number, repetitions: card.repetitions as number, lapses: card.lapses as number },
      grade,
      ctx.today,
    );
    db.prepare("UPDATE flashcards SET ease = ?, interval_days = ?, repetitions = ?, lapses = ?, due_date = ?, last_reviewed = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
      next.ease,
      next.interval_days,
      next.repetitions,
      next.lapses,
      next.due_date,
      ctx.today,
      nowIso(),
      card.id,
      ctx.userId,
    );
    res.json(get(ctx, R.flashcards, card.id as string));
  });

  r.get("/learning/overview", (req, res) => {
    const ctx = makeCtx(db, req);
    const subjects = list(ctx, R.subjects);
    const topics = list(ctx, R.topics);
    const weekStart = startOfWeek(ctx.today, getProfile(db, ctx.userId).week_start);
    const studyRows = db
      .prepare("SELECT subject_id, COALESCE(SUM(actual_min),0) AS m, MAX(local_date) AS last FROM focus_sessions WHERE user_id = ? AND status = 'completed' AND subject_id IS NOT NULL AND local_date >= ? GROUP BY subject_id")
      .all(ctx.userId, weekStart) as { subject_id: string; m: number; last: string }[];
    const study = new Map(studyRows.map((s) => [s.subject_id, s]));
    const due = new Map(
      (db.prepare("SELECT subject_id, COUNT(*) AS n FROM flashcards WHERE user_id = ? AND due_date <= ? GROUP BY subject_id").all(ctx.userId, ctx.today) as { subject_id: string; n: number }[]).map((r) => [r.subject_id, r.n]),
    );
    const cardCounts = new Map(
      (db.prepare("SELECT subject_id, COUNT(*) AS n FROM flashcards WHERE user_id = ? GROUP BY subject_id").all(ctx.userId) as { subject_id: string; n: number }[]).map((r) => [r.subject_id, r.n]),
    );
    const assessments = list(ctx, R.assessments, { filters: { status: "upcoming" } });
    res.json({
      subjects: subjects.map((s) => {
        const ts = topics.filter((t) => t.subject_id === s.id);
        const mastery = ts.length ? ts.reduce((a, t) => a + (t.mastery as number), 0) / (ts.length * 4) : null;
        return {
          ...s,
          topic_count: ts.length,
          mastered: ts.filter((t) => (t.mastery as number) >= 4).length,
          mastery,
          week_min: study.get(s.id as string)?.m ?? 0,
          cards_due: due.get(s.id as string) ?? 0,
          card_count: cardCounts.get(s.id as string) ?? 0,
          next_assessment: assessments.find((a) => a.subject_id === s.id) ?? null,
        };
      }),
      upcoming_assessments: assessments.slice(0, 10),
      cards_due_total: [...due.values()].reduce((a, b) => a + b, 0),
      week_start: weekStart,
    });
  });

  // ---------------------------------------------------------------- skills
  r.get("/skills/overview", (req, res) => {
    const ctx = makeCtx(db, req);
    const skills = list(ctx, R.skills);
    const goals = new Map(goalsWithProgress(ctx).map((g) => [g.id as string, g]));
    const ev = db
      .prepare("SELECT skill_id, COUNT(*) AS n, COALESCE(SUM(CASE WHEN occurred_on >= ? THEN minutes END),0) AS recent_min, MAX(occurred_on) AS last FROM skill_evidence WHERE user_id = ? GROUP BY skill_id")
      .all(addDays(ctx.today, -30), ctx.userId) as { skill_id: string; n: number; recent_min: number; last: string }[];
    const evMap = new Map(ev.map((e) => [e.skill_id, e]));
    const byId = new Map(skills.map((s) => [s.id as string, s]));
    const out = skills.map((s) => {
      const g = s.goal_id ? goals.get(s.goal_id as string) : undefined;
      const gap = Math.max(0, (s.target_level as number) - (s.current_level as number));
      const prereqs = (s.prerequisite_ids as string[]).map((id) => byId.get(id)).filter(Boolean) as Row[];
      const prereqsReady = prereqs.every((p) => (p.current_level as number) >= Math.min(3, p.target_level as number));
      // Priority: gap × goal importance, reduced when prerequisites aren't ready yet.
      let priority = gap * 10;
      const reasons: string[] = [];
      if (gap > 0) reasons.push(`${gap} level${gap === 1 ? "" : "s"} below target`);
      if (g && g.status === "active") {
        priority += g.is_focus ? 25 : 10;
        reasons.push(`Supports ${g.is_focus ? "focus " : ""}goal “${g.title}”`);
        if (g.pace === "behind" || g.pace === "at_risk") {
          priority += 10;
          reasons.push("That goal needs attention");
        }
      }
      if (!prereqsReady && prereqs.length) {
        priority -= 15;
        reasons.push("Prerequisites not ready — build those first");
      }
      const e = evMap.get(s.id as string);
      return { ...s, priority: gap === 0 ? 0 : priority, priority_reasons: reasons, evidence_count: e?.n ?? 0, recent_practice_min: e?.recent_min ?? 0, last_evidence: e?.last ?? null, prerequisites_ready: prereqsReady };
    });
    res.json(out.sort((a, b) => b.priority - a.priority));
  });

  // ---------------------------------------------------------------- people
  r.get("/people/overview", (req, res) => {
    const ctx = makeCtx(db, req);
    res.json({ to_contact: peopleToContact(ctx), birthdays: upcomingBirthdays(ctx, 30), follow_ups: list(ctx, R.people).filter((p) => p.follow_up) });
  });

  // ---------------------------------------------------------------- finance
  r.get("/finance/summary", (req, res) => {
    const ctx = makeCtx(db, req);
    const month = dateQ(req.query.month, ctx.today);
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);
    const accounts = list(ctx, R.financial_accounts);
    const balances = accountBalances(ctx);
    const withBalance = accounts.map((a): Row & { balance: number; liability: boolean } => ({ ...a, ...(balances.get(a.id as string) ?? { balance: a.opening_balance as number, liability: LIABILITY_KINDS.has(a.kind as string) }) }));
    const assets = withBalance.filter((a) => !a.liability && a.include_in_net_worth && !a.archived).reduce((s, a) => s + a.balance, 0);
    const debts = withBalance.filter((a) => a.liability && a.include_in_net_worth && !a.archived).reduce((s, a) => s + a.balance, 0);
    const tx = list(ctx, R.transactions, { from: mStart, to: mEnd, limit: 5000 });
    const income = tx.filter((t) => t.kind === "income").reduce((s, t) => s + (t.amount as number), 0);
    const expenses = tx.filter((t) => t.kind === "expense").reduce((s, t) => s + (t.amount as number), 0);
    const byCategory: Record<string, number> = {};
    for (const t of tx) if (t.kind === "expense") byCategory[(t.category as string) || "Other"] = round2((byCategory[(t.category as string) || "Other"] ?? 0) + (t.amount as number));
    const budgets = list(ctx, R.budgets).map((b) => ({ ...b, spent: byCategory[b.category as string] ?? 0 }));
    const subs = list(ctx, R.subscriptions);
    const subsMonthly = subs.filter((s) => s.active).reduce((a, s) => a + monthlyEquivalent(s.amount as number, s.cycle as string), 0);
    const balById = new Map(withBalance.map((a) => [a.id as string, a.balance]));
    const netWorth = round2(assets - debts);
    const goals = list(ctx, R.financial_goals).map((g) => {
      const current =
        g.kind === "net_worth" ? netWorth : g.account_id ? (balById.get(g.account_id as string) ?? 0) : ((g.current_amount as number) ?? 0);
      return { ...g, current, projection: projectGoal(g.target_amount as number, current, (g.monthly_contribution as number) ?? null, (g.deadline as string) ?? null, ctx.today) };
    });
    // 6-month cash-flow history for trend context.
    const history = [];
    for (let i = 5; i >= 0; i--) {
      const ms = addMonths(mStart, -i);
      const me = endOfMonth(ms);
      const row = db
        .prepare("SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS income, COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) AS expenses FROM transactions WHERE user_id = ? AND occurred_on BETWEEN ? AND ?")
        .get(ctx.userId, ms, me) as { income: number; expenses: number };
      history.push({ month: ms.slice(0, 7), income: round2(row.income), expenses: round2(row.expenses) });
    }
    res.json({
      month: mStart.slice(0, 7),
      accounts: withBalance,
      assets: round2(assets),
      debts: round2(debts),
      net_worth: netWorth,
      income: round2(income),
      expenses: round2(expenses),
      savings_rate: income > 0 ? round2((income - expenses) / income) : null,
      by_category: byCategory,
      budgets,
      subscriptions: subs,
      subscriptions_monthly: round2(subsMonthly),
      goals,
      history,
      transactions: tx.slice(0, 200),
    });
  });

  // ---------------------------------------------------------------- knowledge
  r.get("/notes/:id/backlinks", (req, res) => {
    const ctx = makeCtx(db, req);
    const note = get(ctx, R.notes, req.params.id);
    const title = note.title as string;
    const esc = title.replace(/[\\%_]/g, (c) => "\\" + c);
    const rows = db
      .prepare("SELECT id, title, updated_at FROM notes WHERE user_id = ? AND id <> ? AND body LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 100")
      .all(ctx.userId, note.id, `%[[${esc}]]%`);
    res.json(rows);
  });

  r.get("/linked-notes", (req, res) => {
    const ctx = makeCtx(db, req);
    const { type, id } = z.object({ type: z.string().max(20), id: z.string().max(64) }).parse(req.query);
    const rows = db
      .prepare("SELECT n.id, n.title, n.updated_at FROM note_links l JOIN notes n ON n.id = l.note_id WHERE n.user_id = ? AND l.entity_type = ? AND l.entity_id = ? ORDER BY n.updated_at DESC")
      .all(ctx.userId, type, id);
    res.json(rows);
  });

  r.get("/notes-folders", (req, res) => {
    const ctx = makeCtx(db, req);
    res.json(
      db.prepare("SELECT folder, COUNT(*) AS n FROM notes WHERE user_id = ? AND folder IS NOT NULL GROUP BY folder ORDER BY folder").all(ctx.userId),
    );
  });

  // ---------------------------------------------------------------- quick capture
  r.post("/capture", (req, res) => {
    const ctx = makeCtx(db, req);
    const body = z
      .object({ kind: z.enum(["task", "idea", "note", "goal", "reminder", "journal"]), text: z.string().trim().min(1, "Write something first").max(5000), details: z.string().max(20000).optional() })
      .parse(req.body);
    const parsed = parseCapture(body.text, ctx.today);
    let created: Row;
    let link: string;
    switch (body.kind) {
      case "task":
      case "reminder": {
        if (body.kind === "reminder" && !parsed.date) parsed.date = ctx.today;
        created = create(ctx, R.tasks, { title: parsed.title, notes: body.details ?? null, due_date: parsed.date, due_time: parsed.time, priority: parsed.priority ?? "medium", context: body.kind === "reminder" ? "reminder" : null });
        link = `/tasks?open=${created.id}`;
        break;
      }
      case "idea":
        created = create(ctx, R.notes, { title: body.text.slice(0, 200), body: body.details ?? null, folder: "Ideas", tags: ["idea"] });
        link = `/knowledge/${created.id}`;
        break;
      case "note":
        created = create(ctx, R.notes, { title: body.text.slice(0, 200), body: body.details ?? null, folder: "Inbox" });
        link = `/knowledge/${created.id}`;
        break;
      case "goal":
        created = create(ctx, R.goals, { title: body.text.slice(0, 200), description: body.details ?? null, horizon: "quarter" });
        link = `/goals/${created.id}`;
        break;
      case "journal":
        created = create(ctx, R.journal_entries, { kind: "free", entry_date: ctx.today, body: [body.text, body.details].filter(Boolean).join("\n\n") });
        link = `/journal?open=${created.id}`;
        break;
    }
    res.status(201).json({ kind: body.kind, item: created, link });
  });

  // ---------------------------------------------------------------- search
  r.get("/search", (req, res) => {
    const ctx = makeCtx(db, req);
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q.length < 2) {
      res.json([]);
      return;
    }
    const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const sources: { type: string; table: string; title: string; sub: string; cols: string[]; link: (r: Row) => string }[] = [
      { type: "Task", table: "tasks", title: "title", sub: "status", cols: ["title", "notes"], link: (r) => `/tasks?open=${r.id}` },
      { type: "Project", table: "projects", title: "title", sub: "status", cols: ["title", "description"], link: (r) => `/projects/${r.id}` },
      { type: "Goal", table: "goals", title: "title", sub: "horizon", cols: ["title", "description", "why"], link: (r) => `/goals/${r.id}` },
      { type: "Note", table: "notes", title: "title", sub: "folder", cols: ["title", "body"], link: (r) => `/knowledge/${r.id}` },
      { type: "Journal", table: "journal_entries", title: "COALESCE(title, entry_date)", sub: "kind", cols: ["title", "body", "answers"], link: (r) => `/journal?open=${r.id}` },
      { type: "Habit", table: "habits", title: "title", sub: "frequency", cols: ["title", "description"], link: () => `/habits` },
      { type: "Person", table: "people", title: "name", sub: "relation", cols: ["name", "notes"], link: (r) => `/people?open=${r.id}` },
      { type: "Subject", table: "subjects", title: "title", sub: "kind", cols: ["title", "description"], link: (r) => `/learning/${r.id}` },
      { type: "Skill", table: "skills", title: "title", sub: "domain", cols: ["title", "description"], link: () => `/career` },
      { type: "Decision", table: "decisions", title: "title", sub: "status", cols: ["title", "context", "reasoning"], link: (r) => `/journal/decisions?open=${r.id}` },
    ];
    const out: { type: string; id: string; title: string; subtitle: string; link: string }[] = [];
    for (const s of sources) {
      const where = s.cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ");
      const rows = db
        .prepare(`SELECT id, ${s.title} AS t, ${s.sub} AS sub FROM ${s.table} WHERE user_id = ? AND (${where}) ORDER BY (${s.title.startsWith("COALESCE") ? "title" : s.title} LIKE ? ESCAPE '\\') DESC, updated_at DESC LIMIT 6`)
        .all(ctx.userId, ...s.cols.map(() => like), like) as Row[];
      for (const row of rows) out.push({ type: s.type, id: row.id as string, title: String(row.t ?? ""), subtitle: String(row.sub ?? ""), link: s.link(row) });
    }
    res.json(out);
  });

  r.get("/entity/:type/:id", (req, res) => {
    const ctx = makeCtx(db, req);
    const map: Record<string, string> = { goal: "goals", project: "projects", task: "tasks", subject: "subjects", journal: "journal_entries", note: "notes", person: "people", skill: "skills" };
    const t = map[req.params.type];
    if (!t) throw notFound();
    res.json(get(ctx, R[t], req.params.id));
  });

  return r;
}
