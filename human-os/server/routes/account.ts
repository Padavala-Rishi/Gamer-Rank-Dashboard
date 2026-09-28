import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db";
import { ident, newId, nowIso } from "../db";
import { badRequest, userId } from "../http";
import { getProfile, patchProfile, saveProfile } from "../profile";
import { makeCtx } from "../crud";
import { create } from "../repo";
import { R } from "../resources";
import { onboardingSchema, visionSchema } from "../../shared/schemas";
import { DEFAULT_LIFE_AREAS } from "../../shared/constants";
import { addDays, weekday, zonedToUtc } from "../../shared/dates";
import { loadDemoData } from "../demo";

// Tables in an order where referenced rows come first. Join tables are handled separately.
const OWNED_TABLES = [
  "life_areas",
  "personal_values",
  "goals",
  "milestones",
  "projects",
  "tasks",
  "habits",
  "habit_logs",
  "calendar_events",
  "subjects",
  "topics",
  "focus_sessions",
  "distractions",
  "journal_entries",
  "decisions",
  "decision_reviews",
  "reviews",
  "learning_resources",
  "flashcards",
  "assessments",
  "skills",
  "skill_evidence",
  "people",
  "interactions",
  "applications",
  "financial_accounts",
  "transactions",
  "budgets",
  "subscriptions",
  "financial_goals",
  "notes",
  "tags",
  "checkins",
  "workouts",
  "metrics",
  "metric_entries",
  "environment_checks",
  "ai_conversations",
  "ai_messages",
  "life_audits",
] as const;

/** Foreign-key columns per table → referenced table (used to remap ids on import). */
const FKS: Record<string, Record<string, string>> = {
  goals: { life_area_id: "life_areas", parent_id: "goals" },
  milestones: { goal_id: "goals" },
  projects: { goal_id: "goals", life_area_id: "life_areas" },
  tasks: { project_id: "projects", goal_id: "goals", life_area_id: "life_areas", parent_id: "tasks", recurrence_source_id: "tasks" },
  habits: { life_area_id: "life_areas", goal_id: "goals" },
  habit_logs: { habit_id: "habits" },
  calendar_events: { task_id: "tasks", goal_id: "goals" },
  subjects: { goal_id: "goals", life_area_id: "life_areas" },
  topics: { subject_id: "subjects" },
  focus_sessions: { task_id: "tasks", goal_id: "goals", subject_id: "subjects", topic_id: "topics" },
  distractions: { session_id: "focus_sessions" },
  journal_entries: { goal_id: "goals" },
  decisions: { life_area_id: "life_areas" },
  decision_reviews: { decision_id: "decisions" },
  learning_resources: { subject_id: "subjects", topic_id: "topics" },
  flashcards: { subject_id: "subjects", topic_id: "topics" },
  assessments: { subject_id: "subjects" },
  skills: { goal_id: "goals", life_area_id: "life_areas" },
  skill_evidence: { skill_id: "skills" },
  interactions: { person_id: "people" },
  applications: { person_id: "people" },
  transactions: { account_id: "financial_accounts", to_account_id: "financial_accounts" },
  financial_goals: { account_id: "financial_accounts", goal_id: "goals" },
  metrics: { life_area_id: "life_areas" },
  metric_entries: { metric_id: "metrics" },
  ai_messages: { conversation_id: "ai_conversations" },
};

const JOINS: { table: string; cols: [string, string]; refs: [string, string] }[] = [
  { table: "goal_values", cols: ["goal_id", "value_id"], refs: ["goals", "personal_values"] },
  { table: "task_dependencies", cols: ["task_id", "depends_on_id"], refs: ["tasks", "tasks"] },
  { table: "skill_prerequisites", cols: ["skill_id", "prerequisite_id"], refs: ["skills", "skills"] },
  { table: "note_tags", cols: ["note_id", "tag_id"], refs: ["notes", "tags"] },
];

const LINK_TABLES: Record<string, string> = {
  goal: "goals",
  project: "projects",
  task: "tasks",
  subject: "subjects",
  journal: "journal_entries",
  note: "notes",
  person: "people",
  skill: "skills",
};

export function exportUserData(db: DB, uid: string) {
  const data: Record<string, unknown[]> = {};
  for (const t of OWNED_TABLES) {
    data[t] = (db.prepare(`SELECT * FROM ${ident(t)} WHERE user_id = ?`).all(uid) as Record<string, unknown>[]).map(({ user_id: _u, ...rest }) => {
      void _u;
      return rest;
    });
  }
  for (const j of JOINS) {
    data[j.table] = db
      .prepare(`SELECT j.* FROM ${ident(j.table)} j JOIN ${ident(j.refs[0])} a ON a.id = j.${ident(j.cols[0])} WHERE a.user_id = ?`)
      .all(uid);
  }
  data.note_links = db.prepare("SELECT l.* FROM note_links l JOIN notes n ON n.id = l.note_id WHERE n.user_id = ?").all(uid);
  const vision = db.prepare("SELECT * FROM visions WHERE user_id = ?").get(uid) as Record<string, unknown> | undefined;
  if (vision) delete vision.user_id;
  const user = db.prepare("SELECT email, created_at FROM users WHERE id = ?").get(uid);
  return {
    format: "human-os-export",
    version: 1,
    exported_at: nowIso(),
    account: user,
    profile: getProfile(db, uid),
    vision: vision ?? null,
    data,
  };
}

const importSchema = z.object({
  format: z.literal("human-os-export"),
  version: z.literal(1),
  profile: z.record(z.string(), z.unknown()).optional(),
  vision: z.record(z.string(), z.unknown()).nullable().optional(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown())).max(100_000)),
});

function cleanValue(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    if (v.length > 200_000) throw badRequest("A value in the import is too large.");
    return v;
  }
  throw badRequest("Import contains an unsupported value.");
}

/**
 * Imports an export file *alongside* existing data. Every id is regenerated, so an import can
 * never overwrite or reference rows owned by anyone else.
 */
export function importUserData(db: DB, uid: string, input: unknown): Record<string, number> {
  const parsed = importSchema.parse(input);
  const counts: Record<string, number> = {};
  const idMap: Record<string, Map<string, string>> = {};
  const columns = (t: string) => new Set((db.prepare(`PRAGMA table_info(${ident(t)})`).all() as { name: string }[]).map((c) => c.name));

  db.transaction(() => {
    db.pragma("defer_foreign_keys = ON");
    for (const t of OWNED_TABLES) {
      const m = new Map<string, string>();
      for (const row of parsed.data[t] ?? []) if (typeof row.id === "string") m.set(row.id, newId());
      idMap[t] = m;
    }
    const remap = (table: string, id: unknown) => (typeof id === "string" ? (idMap[table]?.get(id) ?? null) : null);
    for (const t of OWNED_TABLES) {
      const rows = parsed.data[t] ?? [];
      if (!rows.length) continue;
      const cols = columns(t);
      let n = 0;
      for (const row of rows) {
        const newRowId = remap(t, row.id);
        if (!newRowId) continue;
        const out: Record<string, string | number | null> = { id: newRowId, user_id: uid };
        for (const [k, v] of Object.entries(row)) {
          if (k === "id" || k === "user_id" || !cols.has(k)) continue;
          out[k] = FKS[t]?.[k] ? remap(FKS[t][k], v) : cleanValue(v);
        }
        const now = nowIso();
        out.created_at ??= now;
        out.updated_at ??= now;
        out.is_demo ??= 0;
        const keys = Object.keys(out);
        db.prepare(`INSERT OR IGNORE INTO ${ident(t)} (${keys.map(ident).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((k) => out[k]));
        n++;
      }
      counts[t] = n;
    }
    for (const j of JOINS) {
      for (const row of parsed.data[j.table] ?? []) {
        const a = remap(j.refs[0], row[j.cols[0]]);
        const b = remap(j.refs[1], row[j.cols[1]]);
        if (a && b) db.prepare(`INSERT OR IGNORE INTO ${ident(j.table)} (${ident(j.cols[0])}, ${ident(j.cols[1])}) VALUES (?, ?)`).run(a, b);
      }
    }
    for (const row of parsed.data.note_links ?? []) {
      const note = remap("notes", row.note_id);
      const table = LINK_TABLES[row.entity_type as string];
      const target = table ? remap(table, row.entity_id) : null;
      if (note && target) db.prepare("INSERT OR IGNORE INTO note_links (note_id, entity_type, entity_id) VALUES (?, ?, ?)").run(note, row.entity_type, target);
    }
    if (parsed.vision) {
      const v = visionSchema.safeParse(parsed.vision);
      if (v.success) upsertVision(db, uid, v.data, false);
    }
  })();
  return counts;
}

function upsertVision(db: DB, uid: string, v: z.infer<typeof visionSchema>, isDemo: boolean) {
  const cols = Object.keys(visionSchema.shape);
  const row = Object.fromEntries(cols.map((c) => [c, (v as Record<string, unknown>)[c] ?? null]));
  db.prepare(
    `INSERT INTO visions (user_id, ${cols.join(", ")}, is_demo, updated_at) VALUES (?, ${cols.map(() => "?").join(", ")}, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}, is_demo = excluded.is_demo, updated_at = excluded.updated_at`,
  ).run(uid, ...cols.map((c) => row[c]), isDemo ? 1 : 0, nowIso());
}

export function removeDemoData(db: DB, uid: string): number {
  let n = 0;
  db.transaction(() => {
    for (const t of [...OWNED_TABLES].reverse()) {
      n += db.prepare(`DELETE FROM ${ident(t)} WHERE user_id = ? AND is_demo = 1`).run(uid).changes;
    }
    db.prepare("DELETE FROM visions WHERE user_id = ? AND is_demo = 1").run(uid);
  })();
  return n;
}

export function accountRouter(db: DB): Router {
  const r = Router();

  r.get("/profile", (req, res) => res.json(getProfile(db, userId(req))));
  r.patch("/profile", (req, res) => res.json(patchProfile(db, userId(req), req.body)));

  r.get("/vision", (req, res) => {
    const row = db.prepare("SELECT * FROM visions WHERE user_id = ?").get(userId(req)) as Record<string, unknown> | undefined;
    if (row) delete row.user_id;
    res.json(row ?? {});
  });
  r.put("/vision", (req, res) => {
    const v = visionSchema.parse(req.body);
    upsertVision(db, userId(req), v, false);
    res.json(db.prepare("SELECT * FROM visions WHERE user_id = ?").get(userId(req)));
  });

  r.post("/onboarding", (req, res) => {
    const input = onboardingSchema.parse(req.body);
    const uid = userId(req);
    db.transaction(() => {
      if (input.timezone || input.display_name) {
        patchProfile(db, uid, { ...(input.timezone ? { timezone: input.timezone } : {}), ...(input.display_name ? { display_name: input.display_name } : {}) });
      }
      const ctx = makeCtx(db, req);
      upsertVision(db, uid, {
        identity: input.identity,
        ideal_life: input.ideal_life,
        current_reality: input.current_reality,
        what_matters: input.what_matters,
        constraints: input.constraints,
      }, false);
      for (const [i, name] of input.values.entries()) create(ctx, R.personal_values, { name, sort_order: i });

      // Mark the areas the user said need attention.
      const areas = db.prepare("SELECT id, name FROM life_areas WHERE user_id = ?").all(uid) as { id: string; name: string }[];
      const areaIdByKey = new Map<string, string>();
      for (const def of DEFAULT_LIFE_AREAS) {
        const a = areas.find((x) => x.name === def.name);
        if (a) areaIdByKey.set(def.key, a.id);
      }
      for (const key of input.attention_areas) {
        const id = areaIdByKey.get(key);
        if (id) db.prepare("UPDATE life_areas SET focus = 'attention', updated_at = ? WHERE id = ? AND user_id = ?").run(nowIso(), id, uid);
      }
      for (const g of input.goals) {
        create(ctx, R.goals, {
          title: g.title,
          why: g.why,
          life_area_id: g.area_key ? (areaIdByKey.get(g.area_key) ?? null) : null,
          horizon: "quarter",
          is_focus: true,
          start_date: ctx.today,
          deadline: addDays(ctx.today, 90),
        });
      }
      for (const h of input.habits) {
        create(ctx, R.habits, { title: h.title, description: h.minimum ? `Minimum: ${h.minimum}` : null, frequency: "daily" });
      }
      for (const c of input.fixed_commitments) {
        if (c.end <= c.start) continue;
        const days = [...new Set(c.days)].sort();
        const isWeekdays = days.join(",") === "1,2,3,4,5";
        const isDaily = days.length === 7;
        const groups = isWeekdays || isDaily ? [days[0]] : days;
        for (const d of groups) {
          let date = ctx.today;
          while (weekday(date) !== d) date = addDays(date, 1);
          create(ctx, R.calendar_events, {
            title: c.title,
            kind: "other",
            start_at: zonedToUtc(date, c.start, ctx.tz),
            end_at: zonedToUtc(date, c.end, ctx.tz),
            recurrence: isDaily ? "daily" : isWeekdays ? "weekdays" : "weekly",
          });
        }
      }
      const profile = getProfile(db, uid);
      saveProfile(db, uid, { ...profile, day_start: input.day_start, day_end: input.day_end, onboarded: true });
      if (input.load_demo) loadDemoData(db, { ...makeCtx(db, req), isDemo: true });
    })();
    res.json({ ok: true, profile: getProfile(db, uid) });
  });

  r.get("/export", (req, res) => {
    const uid = userId(req);
    res.setHeader("Content-Disposition", `attachment; filename="human-os-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(exportUserData(db, uid));
  });

  r.post("/import", (req, res) => {
    const counts = importUserData(db, userId(req), req.body);
    res.json({ ok: true, imported: counts });
  });

  r.get("/demo", (req, res) => {
    const n = db.prepare("SELECT COUNT(*) AS n FROM goals WHERE user_id = ? AND is_demo = 1").get(userId(req)) as { n: number };
    const t = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND is_demo = 1").get(userId(req)) as { n: number };
    res.json({ loaded: n.n + t.n > 0 });
  });
  r.post("/demo", (req, res) => {
    const ctx = { ...makeCtx(db, req), isDemo: true };
    const exists = db.prepare("SELECT 1 FROM tasks WHERE user_id = ? AND is_demo = 1 LIMIT 1").get(ctx.userId);
    if (exists) throw badRequest("Demo data is already loaded.");
    db.transaction(() => loadDemoData(db, ctx))();
    res.json({ ok: true });
  });
  r.delete("/demo", (req, res) => res.json({ removed: removeDemoData(db, userId(req)) }));

  return r;
}
