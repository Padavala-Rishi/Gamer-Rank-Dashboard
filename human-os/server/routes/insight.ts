import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db";
import { newId, nowIso } from "../db";
import { badRequest, notFound } from "../http";
import { makeCtx } from "../crud";
import { list, update, create, type Ctx } from "../repo";
import { R } from "../resources";
import { getProfile } from "../profile";
import {
  addDays,
  dateInTz,
  diffDays,
  endOfMonth,
  endOfQuarter,
  isValidDate,
  minutesInTz,
  minutesToTime,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  timeToMinutes,
  zonedToUtc,
} from "../../shared/dates";
import { dayCapacity, freeSlots, busyIntervals } from "../../shared/calendar";
import { buildDailyPlan, energyFromScale, rankTasks, recommendNow } from "../../shared/planner";
import { AUDIT_AREA_VALUES, ENERGY_VALUES } from "../../shared/constants";
import {
  checkinFor,
  flashcardsDue,
  goalsWithProgress,
  habitsDueToday,
  habitsWithStats,
  occurrencesBetween,
  peopleToContact,
  planTasks,
  upcomingBirthdays,
  workoutMinutes,
} from "../services";
import { analytics, reviewStats } from "../analytics";
import { analyzeAudit, auditSnapshot } from "../audit";

type Row = Record<string, unknown>;

function nowLocal(ctx: Ctx) {
  const now = new Date();
  return { iso: now.toISOString(), minutes: minutesInTz(now, ctx.tz) };
}

function planFor(ctx: Ctx, date: string, energyOverride?: string) {
  const profile = getProfile(ctx.db, ctx.userId);
  const isToday = date === ctx.today;
  const now = nowLocal(ctx);
  const occ = occurrencesBetween(ctx, date, date);
  const cap = dayCapacity(occ, date, ctx.tz, profile.day_start, profile.day_end, isToday ? now.minutes : undefined);
  const checkin = checkinFor(ctx, ctx.today);
  const energy = (ENERGY_VALUES as readonly string[]).includes(energyOverride ?? "") ? (energyOverride as never) : energyFromScale(checkin?.energy as number | null);
  const goals = goalsWithProgress(ctx);
  const tasks = planTasks(ctx, goals);
  // When planning a future day, judge urgency as of that day.
  const ranked = rankTasks(tasks, date, { energy, nowIso: now.iso });
  const habits = habitsWithStats(ctx, 30);
  const plan = buildDailyPlan(ranked, {
    today: date,
    energy,
    usableMin: cap.usableMin,
    freeMin: cap.freeMin,
    busyMin: cap.busyMin,
    hasFocusGoal: goals.some((g) => g.is_focus && g.status === "active"),
    activeSubjects: list(ctx, R.subjects, { filters: { status: "active" } }).map((s) => ({ id: s.id as string, title: s.title as string })),
    exercisedToday: workoutMinutes(ctx, date, date) > 0,
    restDay: Boolean(checkin?.rest_day) && isToday,
    stress: (checkin?.stress as number) ?? null,
    habitsDue: isToday ? habitsDueToday(ctx, habits).map((h) => ({ id: h.id as string, title: h.title as string })) : [],
    peopleToContact: peopleToContact(ctx).slice(0, 2),
    flashcardsDue: flashcardsDue(ctx),
  });

  // Proposed time blocks: place MITs (then other fitting tasks) into free slots, with 10-minute buffers.
  const slots = cap.slots.map((s) => ({ ...s }));
  const blocks: { task_id: string; title: string; start: string; end: string }[] = [];
  for (const r of [...plan.mits, ...plan.fits]) {
    let remaining = r.estimate;
    for (const s of slots) {
      if (remaining <= 0) break;
      const len = s.end - s.start;
      if (len < 20) continue;
      const take = Math.min(remaining, len, 120);
      blocks.push({ task_id: r.task.id, title: r.task.title, start: minutesToTime(s.start), end: minutesToTime(s.start + take) });
      s.start += take + 10;
      remaining -= take;
    }
  }
  return { date, energy, capacity: cap, plan, blocks, events: occ, timezone: ctx.tz };
}

export function insightRouter(db: DB): Router {
  const r = Router();

  // ------------------------------------------------------------------ today
  r.get("/today", (req, res) => {
    const ctx = makeCtx(db, req);
    const profile = getProfile(db, ctx.userId);
    const now = nowLocal(ctx);
    const today = ctx.today;
    const tasks = list(ctx, R.tasks, { filters: { status: ["todo", "doing"] } });
    const doneToday = db
      .prepare("SELECT id, title, priority, completed_at FROM tasks WHERE user_id = ? AND status = 'done' AND completed_at >= ?")
      .all(ctx.userId, zonedToUtc(today, "00:00", ctx.tz)) as Row[];
    const goals = goalsWithProgress(ctx);
    const habits = habitsWithStats(ctx, 14);
    const events = occurrencesBetween(ctx, today, addDays(today, 1));
    const checkin = checkinFor(ctx, today);
    const focusRows = db
      .prepare("SELECT kind, subject_id, actual_min, status FROM focus_sessions WHERE user_id = ? AND local_date = ?")
      .all(ctx.userId, today) as Row[];
    const running = list(ctx, R.focus_sessions, { filters: { status: "running" }, limit: 1 })[0] ?? null;
    const completedFocus = focusRows.filter((f) => f.status === "completed");
    const scheduledHabits = habits.filter((h) => !h.paused && h.stats.scheduledToday && h.frequency !== "weekly");
    const reflection = db.prepare("SELECT id FROM journal_entries WHERE user_id = ? AND entry_date = ? AND kind = 'daily' LIMIT 1").get(ctx.userId, today) as { id: string } | undefined;
    const practice = db.prepare("SELECT COALESCE(SUM(minutes),0) AS m FROM skill_evidence WHERE user_id = ? AND occurred_on = ?").get(ctx.userId, today) as { m: number };
    const dayStartMin = timeToMinutes(profile.day_start);
    const dayEndMin = Math.max(dayStartMin + 60, timeToMinutes(profile.day_end));
    const dayProgress = Math.max(0, Math.min(1, (now.minutes - dayStartMin) / (dayEndMin - dayStartMin)));
    const attention = goals
      .filter((g) => g.status === "active" && (["behind", "at_risk", "overdue"].includes(g.pace) || (g.is_focus && (!g.last_activity || (g.last_activity as string) < addDays(today, -7)))))
      .slice(0, 5);
    res.json({
      date: today,
      now_min: now.minutes,
      day_progress: dayProgress,
      timezone: ctx.tz,
      checkin,
      mits: tasks.filter((t) => t.mit_date === today),
      overdue: tasks.filter((t) => t.due_date && (t.due_date as string) < today),
      due_today: tasks.filter((t) => t.due_date === today),
      scheduled_today: tasks.filter((t) => t.scheduled_date === today && t.due_date !== today && t.mit_date !== today),
      events: events.filter((e) => e.occurrence_date === today || (dateInTz(e.end_at, ctx.tz) >= today && e.occurrence_date < today)),
      tomorrow_events: events.filter((e) => e.occurrence_date === addDays(today, 1)),
      habits: habits.filter((h) => !h.paused && (h.stats.scheduledToday || h.frequency === "weekly")),
      goals_attention: attention,
      focus_goals: goals.filter((g) => g.is_focus && g.status === "active"),
      running_session: running,
      reflection_id: reflection?.id ?? null,
      people_to_contact: peopleToContact(ctx).slice(0, 3),
      birthdays: upcomingBirthdays(ctx, 7),
      flashcards_due: flashcardsDue(ctx),
      snapshot: {
        tasks_done: doneToday.length,
        important_done: doneToday.filter((t) => t.priority === "critical" || t.priority === "high").length,
        focus_min: completedFocus.reduce((a, f) => a + ((f.actual_min as number) ?? 0), 0),
        study_min: completedFocus.filter((f) => f.kind === "study" || f.subject_id).reduce((a, f) => a + ((f.actual_min as number) ?? 0), 0),
        habits_done: scheduledHabits.filter((h) => h.stats.todayStatus === "done" || h.stats.todayStatus === "minimum").length,
        habits_scheduled: scheduledHabits.length,
        exercise_min: workoutMinutes(ctx, today, today),
        sleep_hours: checkin?.sleep_hours ?? null,
        mood: checkin?.mood ?? null,
        energy: checkin?.energy ?? null,
        stress: checkin?.stress ?? null,
        screen_min: checkin?.screen_min ?? null,
        practice_min: practice.m,
        distractions: (db.prepare("SELECT COUNT(*) AS n FROM distractions WHERE user_id = ? AND local_date = ?").get(ctx.userId, today) as { n: number }).n,
      },
    });
  });

  // ------------------------------------------------------------------ planner
  r.get("/plan", (req, res) => {
    const ctx = makeCtx(db, req);
    const date = isValidDate(req.query.date) ? (req.query.date as string) : ctx.today;
    if (date < ctx.today) throw badRequest("You can only plan today or future days.");
    if (diffDays(ctx.today, date) > 14) throw badRequest("Plan up to two weeks ahead.");
    res.json(planFor(ctx, date, typeof req.query.energy === "string" ? req.query.energy : undefined));
  });

  const commitSchema = z.object({
    date: z.string().refine(isValidDate),
    mit_ids: z.array(z.string().max(64)).max(3),
    scheduled_ids: z.array(z.string().max(64)).max(200).default([]),
    defer: z.array(z.object({ id: z.string().max(64), date: z.string().refine(isValidDate).nullable() })).max(200).default([]),
    blocks: z
      .array(z.object({ task_id: z.string().max(64).nullable(), title: z.string().min(1).max(200), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }))
      .max(30)
      .default([]),
  });

  r.post("/plan/commit", (req, res) => {
    const ctx = makeCtx(db, req);
    const body = commitSchema.parse(req.body);
    if (body.date < ctx.today) throw badRequest("You can only plan today or future days.");
    db.transaction(() => {
      // Clear previous MIT choices for that date, then apply the new ones.
      db.prepare("UPDATE tasks SET mit_date = NULL, updated_at = ? WHERE user_id = ? AND mit_date = ?").run(nowIso(), ctx.userId, body.date);
      for (const id of body.mit_ids) update(ctx, R.tasks, id, { mit_date: body.date, scheduled_date: body.date });
      for (const id of body.scheduled_ids) update(ctx, R.tasks, id, { scheduled_date: body.date });
      for (const d of body.defer) update(ctx, R.tasks, d.id, { scheduled_date: d.date, mit_date: null });
      for (const b of body.blocks) {
        if (b.end <= b.start) continue;
        create(ctx, R.calendar_events, {
          title: b.title,
          kind: "focus",
          task_id: b.task_id,
          start_at: zonedToUtc(body.date, b.start, ctx.tz),
          end_at: zonedToUtc(body.date, b.end, ctx.tz),
        });
      }
    })();
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------ what should I do now?
  r.get("/next-action", (req, res) => {
    const ctx = makeCtx(db, req);
    const profile = getProfile(db, ctx.userId);
    const now = nowLocal(ctx);
    const occ = occurrencesBetween(ctx, ctx.today, addDays(ctx.today, 1));
    const upcoming = occ
      .filter((o) => !o.all_day && o.kind !== "sleep" && o.start_at > now.iso)
      .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
    const current = occ.find((o) => !o.all_day && o.kind !== "sleep" && o.kind !== "focus" && o.kind !== "study" && o.start_at <= now.iso && o.end_at > now.iso);
    const dayEnd = timeToMinutes(profile.day_end);
    let available = Math.max(0, dayEnd - now.minutes);
    let next: { title: string; startsInMin: number } | null = null;
    if (upcoming) {
      const mins = Math.round((Date.parse(upcoming.start_at) - Date.parse(now.iso)) / 60000);
      if (mins < available) {
        available = mins;
        next = { title: upcoming.title, startsInMin: mins };
      }
    }
    const override = typeof req.query.available === "string" ? Number(req.query.available) : NaN;
    if (Number.isFinite(override) && override > 0) available = Math.min(600, override);
    const checkin = checkinFor(ctx, ctx.today);
    const energyQ = typeof req.query.energy === "string" && (ENERGY_VALUES as readonly string[]).includes(req.query.energy) ? (req.query.energy as never) : null;
    const energy = energyQ ?? energyFromScale(checkin?.energy as number | null);
    const running = list(ctx, R.focus_sessions, { filters: { status: "running" }, limit: 1 })[0];
    const goals = goalsWithProgress(ctx);
    const ranked = rankTasks(planTasks(ctx, goals), ctx.today, { energy, availableMin: available, nowIso: now.iso });
    const habits = habitsWithStats(ctx, 30);
    const exclude = new Set(typeof req.query.exclude === "string" ? req.query.exclude.split(",").slice(0, 50) : []);
    const person = peopleToContact(ctx)[0] ?? null;
    const result = recommendNow(ranked, {
      today: ctx.today,
      nowIso: now.iso,
      availableMin: available,
      nextCommitment: next,
      energy,
      stress: (checkin?.stress as number) ?? null,
      runningSession: running
        ? {
            id: running.id as string,
            objective: (running.objective as string) ?? null,
            remainingMin: Math.max(0, (running.planned_min as number) - Math.round((Date.now() - Date.parse(running.started_at as string)) / 60000)),
          }
        : null,
      checkinDone: !!checkin,
      isEvening: now.minutes >= 18 * 60,
      habitsDue: habitsDueToday(ctx, habits).map((h) => ({
        id: h.id as string,
        title: h.title as string,
        minimum: h.minimum_value != null ? `${h.minimum_value} ${h.unit ?? ""}`.trim() : ((h.description as string)?.startsWith("Minimum:") ? (h.description as string).slice(9).trim() : null),
        streak: h.stats.currentStreak,
      })),
      flashcardsDue: flashcardsDue(ctx),
      exercisedToday: workoutMinutes(ctx, ctx.today, ctx.today) > 0,
      restDay: Boolean(checkin?.rest_day),
      personToContact: person ? { id: person.id, name: person.name, days: person.days } : null,
      exclude,
    });
    // Outside the planned day, rest is the recommendation; work stays available as alternatives.
    const dayStartMin = timeToMinutes(profile.day_start);
    const outside = now.minutes < dayStartMin || now.minutes >= dayEnd;
    if (outside && !running && !Number.isFinite(override)) {
      const before = now.minutes < dayStartMin;
      const rest = {
        key: "rest",
        kind: "recovery" as const,
        title: before ? "Your day hasn't started yet" : "Your planned day is over",
        action: before ? `Sleep, or ease into the morning. Your day starts at ${profile.day_start}.` : "Wind down: dim the screens, jot tomorrow's first task, and head to bed.",
        why: [`It's outside the hours you set for your day (${profile.day_start}–${profile.day_end}).`, "Rest is part of performance — tomorrow's plan will be ready."],
        minutes: 30,
        expected: "Better sleep and a clearer start.",
        score: 999,
      };
      res.json({
        primary: rest,
        alternatives: [result.primary, ...result.alternatives].filter(Boolean).slice(0, 3),
        context: `It's ${minutesToTime(now.minutes)} — outside your planned day.`,
        available_min: 0,
        energy,
        in_commitment: null,
        day_over: true,
      });
      return;
    }
    res.json({
      ...result,
      available_min: available,
      energy,
      in_commitment: current ? { title: current.title, ends_at: current.end_at } : null,
      day_over: now.minutes >= dayEnd,
    });
  });

  // ------------------------------------------------------------------ analytics
  r.get("/analytics", (req, res) => {
    const ctx = makeCtx(db, req);
    const range = [7, 30, 90, 365].includes(Number(req.query.range)) ? Number(req.query.range) : 30;
    res.json(analytics(ctx, range));
  });

  r.get("/reviews/stats", (req, res) => {
    const ctx = makeCtx(db, req);
    const profile = getProfile(db, ctx.userId);
    const kind = z.enum(["weekly", "monthly", "quarterly"]).parse(req.query.kind ?? "weekly");
    const anchor = isValidDate(req.query.date) ? (req.query.date as string) : ctx.today;
    const from = kind === "weekly" ? startOfWeek(anchor, profile.week_start) : kind === "monthly" ? startOfMonth(anchor) : startOfQuarter(anchor);
    const to = kind === "weekly" ? addDays(from, 6) : kind === "monthly" ? endOfMonth(anchor) : endOfQuarter(anchor);
    const existing = list(ctx, R.reviews, { filters: { kind } }).find((rv) => rv.period_start === from) ?? null;
    res.json({ kind, from, to, stats: reviewStats(ctx, from, to), review: existing });
  });

  // ------------------------------------------------------------------ notifications
  r.get("/notifications", (req, res) => {
    const ctx = makeCtx(db, req);
    generateNotifications(ctx);
    const rows = db
      .prepare("SELECT id, kind, title, body, link, created_at, read_at FROM notifications WHERE user_id = ? AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 50")
      .all(ctx.userId);
    res.json(rows);
  });
  r.post("/notifications/read-all", (req, res) => {
    const ctx = makeCtx(db, req);
    db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(nowIso(), ctx.userId);
    res.json({ ok: true });
  });
  r.post("/notifications/:id/dismiss", (req, res) => {
    const ctx = makeCtx(db, req);
    const n = db.prepare("UPDATE notifications SET dismissed_at = ?, read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?").run(nowIso(), nowIso(), req.params.id, ctx.userId);
    if (!n.changes) throw notFound("Notification");
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------ life audit
  const auditInput = z.object({
    ratings: z.partialRecord(z.enum(AUDIT_AREA_VALUES), z.object({ score: z.number().int().min(1).max(10), note: z.string().max(1000).nullable().optional() })),
    answers: z.record(z.string().max(200), z.string().max(4000)).default({}),
  });
  r.get("/audits", (req, res) => {
    const ctx = makeCtx(db, req);
    const rows = db.prepare("SELECT id, created_at, ratings FROM life_audits WHERE user_id = ? ORDER BY created_at DESC").all(ctx.userId) as Row[];
    res.json(rows.map((r) => ({ ...r, ratings: JSON.parse(r.ratings as string) })));
  });
  r.get("/audits/:id", (req, res) => {
    const ctx = makeCtx(db, req);
    res.json(loadAudit(ctx, req.params.id));
  });
  r.post("/audits", (req, res) => {
    const ctx = makeCtx(db, req);
    const input = auditInput.parse(req.body);
    if (Object.keys(input.ratings).length < 3) throw badRequest("Rate at least three areas for a meaningful audit.");
    const snapshot = auditSnapshot(ctx);
    const findings = analyzeAudit(input.ratings as never, snapshot);
    const id = newId();
    const now = nowIso();
    db.prepare("INSERT INTO life_audits (id, user_id, is_demo, created_at, updated_at, ratings, answers, snapshot, findings) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)").run(
      id,
      ctx.userId,
      now,
      now,
      JSON.stringify(input.ratings),
      JSON.stringify(input.answers),
      JSON.stringify(snapshot),
      JSON.stringify(findings),
    );
    res.status(201).json(loadAudit(ctx, id));
  });
  r.delete("/audits/:id", (req, res) => {
    const ctx = makeCtx(db, req);
    const n = db.prepare("DELETE FROM life_audits WHERE id = ? AND user_id = ?").run(req.params.id, ctx.userId);
    if (!n.changes) throw notFound("Audit");
    res.json({ ok: true });
  });

  // Convenience: the focus-goal tree for the compass page.
  r.get("/compass", (req, res) => {
    const ctx = makeCtx(db, req);
    const vision = db.prepare("SELECT * FROM visions WHERE user_id = ?").get(ctx.userId) as Row | undefined;
    if (vision) delete vision.user_id;
    const goals = goalsWithProgress(ctx);
    const values = list(ctx, R.personal_values);
    res.json({
      vision: vision ?? {},
      values: values.map((v) => ({ ...v, goal_count: goals.filter((g) => ((g.value_ids as string[]) ?? []).includes(v.id as string) && g.status === "active").length })),
      areas: list(ctx, R.life_areas).map((a) => ({
        ...a,
        goal_count: goals.filter((g) => g.life_area_id === a.id && g.status === "active").length,
      })),
      goals: goals.filter((g) => g.status === "active"),
    });
  });

  // Free slots for quick scheduling ("SCHEDULE" on a recommendation).
  r.get("/free-slots", (req, res) => {
    const ctx = makeCtx(db, req);
    const profile = getProfile(db, ctx.userId);
    const date = isValidDate(req.query.date) ? (req.query.date as string) : ctx.today;
    const minLen = Math.min(240, Math.max(5, Number(req.query.min) || 15));
    const occ = occurrencesBetween(ctx, date, date);
    const now = nowLocal(ctx);
    let ws = timeToMinutes(profile.day_start);
    if (date === ctx.today) ws = Math.max(ws, Math.ceil(now.minutes / 5) * 5);
    const slots = freeSlots(busyIntervals(occ, date, ctx.tz), ws, timeToMinutes(profile.day_end), minLen);
    res.json(slots.map((s) => ({ start: minutesToTime(s.start), end: minutesToTime(s.end), minutes: s.end - s.start })));
  });

  return r;
}

function loadAudit(ctx: Ctx, id: string) {
  const row = ctx.db.prepare("SELECT * FROM life_audits WHERE id = ? AND user_id = ?").get(id, ctx.userId) as Row | undefined;
  if (!row) throw notFound("Audit");
  return {
    id: row.id,
    created_at: row.created_at,
    ratings: JSON.parse(row.ratings as string),
    answers: JSON.parse(row.answers as string),
    snapshot: JSON.parse(row.snapshot as string),
    findings: JSON.parse(row.findings as string),
    ai_interpretation: row.ai_interpretation ?? null,
  };
}

/** Creates in-app notifications from the user's data. Deduplicated, capped per day, respects preferences. */
export function generateNotifications(ctx: Ctx): void {
  const profile = getProfile(ctx.db, ctx.userId);
  const prefs = profile.notification_prefs;
  if (!prefs.enabled) return;
  const on = (k: string) => (prefs.kinds as Record<string, boolean>)[k] !== false;
  const todayStart = zonedToUtc(ctx.today, "00:00", ctx.tz);
  const createdToday = (ctx.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND created_at >= ?").get(ctx.userId, todayStart) as { n: number }).n;
  let budget = prefs.max_per_day - createdToday;
  if (budget <= 0) return;
  const now = new Date();
  const nowMin = minutesInTz(now, ctx.tz);
  const add = (kind: string, key: string, title: string, body: string | null, link: string | null) => {
    if (budget <= 0) return;
    const t = nowIso();
    const res = ctx.db
      .prepare("INSERT OR IGNORE INTO notifications (id, user_id, is_demo, created_at, updated_at, kind, title, body, link, dedupe_key) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)")
      .run(newId(), ctx.userId, t, t, kind, title, body, link, key);
    if (res.changes) budget--;
  };

  if (on("deadline")) {
    const overdue = (ctx.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status IN ('todo','doing') AND due_date < ?").get(ctx.userId, ctx.today) as { n: number }).n;
    const dueToday = ctx.db.prepare("SELECT title FROM tasks WHERE user_id = ? AND status IN ('todo','doing') AND due_date = ? ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END LIMIT 3").all(ctx.userId, ctx.today) as { title: string }[];
    if (dueToday.length) add("deadline", `deadline:${ctx.today}`, `${dueToday.length === 3 ? "3+" : dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today`, dueToday.map((t) => t.title).join(" · "), "/tasks?view=today");
    if (overdue >= 1) add("deadline", `overdue:${ctx.today}`, `${overdue} overdue task${overdue === 1 ? "" : "s"}`, "Reschedule, delegate or drop them — carrying them silently costs attention.", "/tasks?view=overdue");
    const upcomingAssess = ctx.db.prepare("SELECT id, title, due_date FROM assessments WHERE user_id = ? AND status = 'upcoming' AND due_date BETWEEN ? AND ?").all(ctx.userId, ctx.today, addDays(ctx.today, 3)) as Row[];
    for (const a of upcomingAssess) add("deadline", `assessment:${a.id}:${a.due_date}`, `${a.title} is ${a.due_date === ctx.today ? "today" : `on ${a.due_date}`}`, null, "/learning");
  }
  if (on("habit") && nowMin >= 18 * 60) {
    const due = habitsDueToday(ctx);
    if (due.length) add("habit", `habit:${ctx.today}`, `${due.length} habit${due.length === 1 ? "" : "s"} still open today`, "The minimum version counts. Skipping on purpose is fine too.", "/habits");
  }
  if (on("milestone")) {
    const ms = ctx.db.prepare("SELECT m.id, m.title, m.due_date, g.id AS goal_id FROM milestones m JOIN goals g ON g.id = m.goal_id WHERE m.user_id = ? AND m.completed_at IS NULL AND m.due_date BETWEEN ? AND ? AND g.status = 'active'").all(ctx.userId, ctx.today, addDays(ctx.today, 3)) as Row[];
    for (const m of ms) add("milestone", `milestone:${m.id}:${m.due_date}`, `Milestone due ${m.due_date === ctx.today ? "today" : m.due_date}: ${m.title}`, null, `/goals/${m.goal_id}`);
  }
  if (on("birthday")) {
    for (const b of upcomingBirthdays(ctx, 3)) add("birthday", `birthday:${b.id}:${b.date}`, b.inDays === 0 ? `Today is ${b.name}'s birthday` : `${b.name}'s birthday in ${b.inDays} day${b.inDays === 1 ? "" : "s"}`, null, `/people?open=${b.id}`);
    const people = peopleToContact(ctx);
    if (people.length) add("birthday", `contact:${startOfWeek(ctx.today, profile.week_start)}`, `Reconnect with ${people.slice(0, 2).map((p) => p.name).join(" and ")}${people.length > 2 ? ` and ${people.length - 2} more` : ""}`, "It's been longer than the rhythm you chose.", "/people");
  }
  if (on("flashcards")) {
    const n = flashcardsDue(ctx);
    if (n >= 10) add("flashcards", `flashcards:${ctx.today}`, `${n} flashcards are due`, "A short review keeps them from piling up.", "/learning/review");
  }
  if (on("decision")) {
    const ds = ctx.db.prepare("SELECT id, title FROM decisions WHERE user_id = ? AND status = 'open' AND review_on IS NOT NULL AND review_on <= ?").all(ctx.userId, ctx.today) as Row[];
    for (const d of ds) add("decision", `decision:${d.id}`, `Time to review a decision: ${d.title}`, "Compare what you predicted with what happened.", `/journal/decisions?open=${d.id}`);
  }
  if (on("review")) {
    const ws = startOfWeek(ctx.today, profile.week_start);
    const lastDay = addDays(ws, 6);
    if (diffDays(ctx.today, lastDay) <= 1) {
      const done = ctx.db.prepare("SELECT 1 FROM reviews WHERE user_id = ? AND kind = 'weekly' AND period_start = ? AND status = 'done'").get(ctx.userId, ws);
      if (!done) add("review", `review:weekly:${ws}`, "Your weekly review is ready", "20 minutes to look back and set next week's priorities.", "/reviews?kind=weekly");
    }
    const me = endOfMonth(ctx.today);
    if (diffDays(ctx.today, me) <= 1) {
      const ms = startOfMonth(ctx.today);
      const done = ctx.db.prepare("SELECT 1 FROM reviews WHERE user_id = ? AND kind = 'monthly' AND period_start = ? AND status = 'done'").get(ctx.userId, ms);
      if (!done) add("review", `review:monthly:${ms}`, "Time for your monthly review", null, "/reviews?kind=monthly");
    }
  }
}
