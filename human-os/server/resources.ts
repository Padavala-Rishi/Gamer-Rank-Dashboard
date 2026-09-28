// Registry of user-owned resources exposed through the generic CRUD API,
// with the domain rules each one needs.
import * as S from "../shared/schemas";
import { nextDueAfterCompletion } from "../shared/recurrence";
import { dateInTz, minutesInTz } from "../shared/dates";
import { newId, nowIso } from "./db";
import { badRequest } from "./http";
import { create, type Ctx, type ResourceDef } from "./repo";

type Row = Record<string, unknown>;

const lifeAreas: ResourceDef = {
  name: "life-areas",
  table: "life_areas",
  schema: S.lifeAreaSchema,
  bools: ["archived"],
  order: "sort_order, created_at",
  filters: ["archived", "focus"],
};

const values: ResourceDef = {
  name: "values",
  table: "personal_values",
  schema: S.valueSchema,
  order: "sort_order, created_at",
};

const goals: ResourceDef = {
  name: "goals",
  table: "goals",
  schema: S.goalSchema,
  refs: { life_area_id: "life_areas", parent_id: "goals" },
  bools: ["is_focus"],
  m2m: [{ field: "value_ids", table: "goal_values", self: "goal_id", other: "value_id", otherTable: "personal_values" }],
  serverColumns: ["achieved_at"],
  treeField: "parent_id",
  order: "CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'achieved' THEN 2 ELSE 3 END, deadline IS NULL, deadline, created_at",
  filters: ["status", "horizon", "life_area_id", "parent_id", "is_focus"],
  searchColumns: ["title", "description", "why"],
  beforeWrite: (_ctx, d) => {
    if (d.status === "achieved") d.achieved_at ??= nowIso();
    else d.achieved_at = null;
    if (d.start_date && d.deadline && (d.deadline as string) < (d.start_date as string)) throw badRequest("Deadline is before the start date.");
  },
};

const milestones: ResourceDef = {
  name: "milestones",
  table: "milestones",
  schema: S.milestoneSchema,
  refs: { goal_id: "goals" },
  order: "sort_order, due_date IS NULL, due_date, created_at",
  filters: ["goal_id"],
};

const projects: ResourceDef = {
  name: "projects",
  table: "projects",
  schema: S.projectSchema,
  refs: { goal_id: "goals", life_area_id: "life_areas" },
  serverColumns: ["completed_at"],
  order: "CASE status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 WHEN 'on_hold' THEN 2 WHEN 'done' THEN 3 ELSE 4 END, deadline IS NULL, deadline, created_at",
  filters: ["status", "goal_id", "life_area_id"],
  searchColumns: ["title", "description", "notes"],
  beforeWrite: (_ctx, d) => {
    if (d.status === "done") d.completed_at ??= nowIso();
    else d.completed_at = null;
  },
  beforeDelete: (ctx, row, query) => {
    // Default: keep the tasks (they move to the inbox). Opt in to deleting them.
    if (query.with_tasks === "1" || query.with_tasks === "true") {
      ctx.db.prepare("DELETE FROM tasks WHERE project_id = ? AND user_id = ?").run(row.id, ctx.userId);
    }
  },
  decorate: (ctx, rows) => {
    if (!rows.length) return;
    const stats = ctx.db
      .prepare(
        "SELECT project_id, COUNT(*) AS total, SUM(status = 'done') AS done, SUM(CASE WHEN status NOT IN ('done','cancelled') THEN COALESCE(estimate_min,0) ELSE 0 END) AS remaining_min, SUM(COALESCE(actual_min,0)) AS actual_min FROM tasks WHERE user_id = ? AND project_id IS NOT NULL AND status <> 'cancelled' AND parent_id IS NULL GROUP BY project_id",
      )
      .all(ctx.userId) as { project_id: string; total: number; done: number; remaining_min: number; actual_min: number }[];
    const map = new Map(stats.map((s) => [s.project_id, s]));
    for (const r of rows) {
      const s = map.get(r.id as string);
      r.task_total = s?.total ?? 0;
      r.task_done = s?.done ?? 0;
      r.remaining_min = s?.remaining_min ?? 0;
      r.actual_min = s?.actual_min ?? 0;
    }
  },
};

const tasks: ResourceDef = {
  name: "tasks",
  table: "tasks",
  schema: S.taskSchema,
  refs: { project_id: "projects", goal_id: "goals", life_area_id: "life_areas", parent_id: "tasks" },
  m2m: [{ field: "depends_on", table: "task_dependencies", self: "task_id", other: "depends_on_id", otherTable: "tasks" }],
  serverColumns: ["completed_at", "recurrence_source_id"],
  treeField: "parent_id",
  order:
    "CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, due_date IS NULL, due_date, CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, sort_order, created_at",
  filters: ["status", "project_id", "goal_id", "life_area_id", "parent_id", "priority", "mit_date", "scheduled_date", "due_date", "energy", "context"],
  dateField: "due_date",
  searchColumns: ["title", "notes"],
  beforeWrite: (ctx, d, existing) => {
    if (d.status === "done") d.completed_at ??= nowIso();
    else d.completed_at = null;
    // A subtask inherits its parent's project so it shows up in the right place.
    if (d.parent_id && !existing) {
      const parent = ctx.db.prepare("SELECT project_id, goal_id FROM tasks WHERE id = ? AND user_id = ?").get(d.parent_id, ctx.userId) as
        | { project_id: string | null; goal_id: string | null }
        | undefined;
      if (parent) {
        d.project_id ??= parent.project_id;
        d.goal_id ??= parent.goal_id;
      }
    }
  },
  afterWrite: (ctx, row, existing) => {
    const becameDone = row.status === "done" && existing?.status !== "done" && existing !== null;
    if (becameDone && row.recurrence) spawnNextOccurrence(ctx, row);
  },
  decorate: (ctx, rows) => {
    if (!rows.length) return;
    const blocked = new Set(
      (
        ctx.db
          .prepare(
            "SELECT DISTINCT d.task_id FROM task_dependencies d JOIN tasks t ON t.id = d.depends_on_id WHERE t.user_id = ? AND t.status NOT IN ('done','cancelled')",
          )
          .all(ctx.userId) as { task_id: string }[]
      ).map((r) => r.task_id),
    );
    const subs = new Map(
      (
        ctx.db
          .prepare("SELECT parent_id, COUNT(*) AS total, SUM(status = 'done') AS done FROM tasks WHERE user_id = ? AND parent_id IS NOT NULL AND status <> 'cancelled' GROUP BY parent_id")
          .all(ctx.userId) as { parent_id: string; total: number; done: number }[]
      ).map((r) => [r.parent_id, r]),
    );
    for (const r of rows) {
      r.blocked = blocked.has(r.id as string);
      const s = subs.get(r.id as string);
      r.subtask_total = s?.total ?? 0;
      r.subtask_done = s?.done ?? 0;
    }
  },
};

/** Creates the next instance of a recurring task when the current one is completed. */
function spawnNextOccurrence(ctx: Ctx, row: Row): void {
  // Idempotency: never spawn twice from the same completed instance.
  const already = ctx.db.prepare("SELECT 1 FROM tasks WHERE recurrence_source_id = ? AND user_id = ?").get(row.id, ctx.userId);
  if (already) return;
  const nextDue = nextDueAfterCompletion(row.recurrence as string, (row.due_date as string) ?? null, ctx.today);
  const next = create(ctx, tasks, {
    title: row.title,
    notes: row.notes,
    project_id: row.project_id,
    goal_id: row.goal_id,
    life_area_id: row.life_area_id,
    priority: row.priority,
    due_date: nextDue,
    due_time: row.due_time,
    estimate_min: row.estimate_min,
    energy: row.energy,
    context: row.context,
    recurrence: row.recurrence,
    first_step: row.first_step,
  });
  ctx.db.prepare("UPDATE tasks SET recurrence_source_id = ? WHERE id = ? AND user_id = ?").run(row.id, next.id, ctx.userId);
  // The completed instance no longer repeats; the new one carries the rule.
  ctx.db.prepare("UPDATE tasks SET recurrence = NULL WHERE id = ? AND user_id = ?").run(row.id, ctx.userId);
}

const habits: ResourceDef = {
  name: "habits",
  table: "habits",
  schema: S.habitSchema,
  refs: { life_area_id: "life_areas", goal_id: "goals" },
  json: ["days"],
  bools: ["paused", "archived"],
  order: "archived, sort_order, created_at",
  filters: ["archived", "paused", "goal_id", "life_area_id"],
  searchColumns: ["title", "description"],
  beforeWrite: (_ctx, d) => {
    if (d.frequency === "days" && !(d.days as number[])?.length) throw badRequest("Pick at least one day.");
    if (d.frequency === "weekly" && !d.times_per_week) d.times_per_week = 3;
    if (d.minimum_value != null && d.target_value != null && (d.minimum_value as number) > (d.target_value as number)) {
      throw badRequest("The minimum can't be bigger than the target.");
    }
  },
};

const habitLogs: ResourceDef = {
  name: "habit-logs",
  table: "habit_logs",
  schema: S.habitLogSchema,
  refs: { habit_id: "habits" },
  upsertOn: ["habit_id", "date"],
  immutable: ["habit_id", "date"],
  order: "date DESC",
  filters: ["habit_id", "date"],
  dateField: "date",
  beforeWrite: (ctx, d) => {
    if ((d.date as string) > ctx.today) throw badRequest("You can't log a habit for a future day.");
  },
};

const events: ResourceDef = {
  name: "events",
  table: "calendar_events",
  schema: S.eventSchema,
  refs: { task_id: "tasks", goal_id: "goals" },
  bools: ["all_day"],
  order: "start_at",
  filters: ["kind", "task_id"],
  searchColumns: ["title", "notes", "location"],
  beforeWrite: (_ctx, d) => {
    if (!((d.end_at as string) > (d.start_at as string))) throw badRequest("The end time must be after the start time.");
    if (Date.parse(d.end_at as string) - Date.parse(d.start_at as string) > 14 * 86_400_000) throw badRequest("Events can be at most 14 days long.");
  },
};

const focusSessions: ResourceDef = {
  name: "focus-sessions",
  table: "focus_sessions",
  schema: S.focusSessionSchema,
  refs: { task_id: "tasks", goal_id: "goals", subject_id: "subjects", topic_id: "topics" },
  serverColumns: ["local_date"],
  order: "started_at DESC",
  filters: ["status", "task_id", "goal_id", "subject_id", "topic_id", "local_date"],
  dateField: "local_date",
  beforeWrite: (ctx, d) => {
    d.started_at ??= nowIso();
    d.local_date = dateInTz(d.started_at as string, ctx.tz);
    if (d.ended_at && d.actual_min == null) {
      d.actual_min = Math.max(0, Math.round((Date.parse(d.ended_at as string) - Date.parse(d.started_at as string)) / 60_000));
    }
    if (d.ended_at && (d.ended_at as string) < (d.started_at as string)) throw badRequest("A session can't end before it starts.");
  },
};

const distractions: ResourceDef = {
  name: "distractions",
  table: "distractions",
  schema: S.distractionSchema,
  refs: { session_id: "focus_sessions" },
  serverColumns: ["local_date", "local_hour"],
  order: "occurred_at DESC",
  filters: ["session_id", "kind", "local_date"],
  dateField: "local_date",
  beforeWrite: (ctx, d) => {
    d.occurred_at ??= nowIso();
    d.local_date = dateInTz(d.occurred_at as string, ctx.tz);
    d.local_hour = Math.floor(minutesInTz(d.occurred_at as string, ctx.tz) / 60);
  },
};

const journal: ResourceDef = {
  name: "journal",
  table: "journal_entries",
  schema: S.journalSchema,
  refs: { goal_id: "goals" },
  json: ["answers"],
  order: "entry_date DESC, created_at DESC",
  filters: ["kind", "entry_date", "goal_id"],
  dateField: "entry_date",
  searchColumns: ["title", "body", "answers"],
};

const decisions: ResourceDef = {
  name: "decisions",
  table: "decisions",
  schema: S.decisionSchema,
  refs: { life_area_id: "life_areas" },
  order: "status, decided_on DESC",
  filters: ["status", "life_area_id"],
  searchColumns: ["title", "context", "reasoning"],
};

const decisionReviews: ResourceDef = {
  name: "decision-reviews",
  table: "decision_reviews",
  schema: S.decisionReviewSchema,
  refs: { decision_id: "decisions" },
  bools: ["would_decide_same"],
  order: "reviewed_on DESC",
  filters: ["decision_id"],
  afterWrite: (ctx, row) => {
    ctx.db.prepare("UPDATE decisions SET status = 'reviewed', updated_at = ? WHERE id = ? AND user_id = ?").run(nowIso(), row.decision_id, ctx.userId);
  },
};

const reviews: ResourceDef = {
  name: "reviews",
  table: "reviews",
  schema: S.reviewSchema,
  json: ["answers", "priorities", "goal_decisions", "snapshot"],
  serverColumns: ["completed_at"],
  upsertOn: ["kind", "period_start"],
  order: "period_start DESC",
  filters: ["kind", "status"],
  beforeWrite: (_ctx, d) => {
    if ((d.period_end as string) < (d.period_start as string)) throw badRequest("Period end is before its start.");
    if (d.status === "done") d.completed_at ??= nowIso();
    else d.completed_at = null;
  },
  afterWrite: (ctx, row, existing) => {
    // Completing a quarterly review applies "drop" decisions to the goals.
    if (row.status === "done" && existing?.status !== "done") {
      const decisions = (row.goal_decisions ?? {}) as Record<string, string>;
      const drop = ctx.db.prepare("UPDATE goals SET status = 'dropped', updated_at = ? WHERE id = ? AND user_id = ? AND status IN ('active','paused')");
      for (const [goalId, decision] of Object.entries(decisions)) if (decision === "drop") drop.run(nowIso(), goalId, ctx.userId);
    }
  },
};

const subjects: ResourceDef = {
  name: "subjects",
  table: "subjects",
  schema: S.subjectSchema,
  refs: { goal_id: "goals", life_area_id: "life_areas" },
  order: "CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, title",
  filters: ["status", "goal_id", "kind"],
  searchColumns: ["title", "description", "provider"],
};

const topics: ResourceDef = {
  name: "topics",
  table: "topics",
  schema: S.topicSchema,
  refs: { subject_id: "subjects" },
  serverColumns: ["last_studied"],
  order: "sort_order, created_at",
  filters: ["subject_id", "mastery"],
  searchColumns: ["title", "notes"],
};

const learningResources: ResourceDef = {
  name: "resources",
  table: "learning_resources",
  schema: S.resourceSchema,
  refs: { subject_id: "subjects", topic_id: "topics" },
  order: "status, created_at",
  filters: ["subject_id", "topic_id", "status"],
  searchColumns: ["title", "notes"],
};

const flashcards: ResourceDef = {
  name: "flashcards",
  table: "flashcards",
  schema: S.flashcardSchema,
  refs: { subject_id: "subjects", topic_id: "topics" },
  serverColumns: ["due_date"],
  order: "due_date, created_at",
  filters: ["subject_id", "topic_id"],
  dateField: "due_date",
  searchColumns: ["front", "back"],
  beforeWrite: (ctx, d, existing) => {
    if (!existing) d.due_date = ctx.today;
  },
};

const assessments: ResourceDef = {
  name: "assessments",
  table: "assessments",
  schema: S.assessmentSchema,
  refs: { subject_id: "subjects" },
  order: "due_date",
  filters: ["subject_id", "status", "kind"],
  dateField: "due_date",
  searchColumns: ["title", "notes"],
};

const skills: ResourceDef = {
  name: "skills",
  table: "skills",
  schema: S.skillSchema,
  refs: { goal_id: "goals", life_area_id: "life_areas" },
  m2m: [{ field: "prerequisite_ids", table: "skill_prerequisites", self: "skill_id", other: "prerequisite_id", otherTable: "skills" }],
  order: "domain, title",
  filters: ["domain", "goal_id", "category"],
  searchColumns: ["title", "description", "category"],
};

const skillEvidence: ResourceDef = {
  name: "skill-evidence",
  table: "skill_evidence",
  schema: S.skillEvidenceSchema,
  refs: { skill_id: "skills" },
  order: "occurred_on DESC",
  filters: ["skill_id", "kind"],
  dateField: "occurred_on",
  searchColumns: ["title", "notes"],
};

const applications: ResourceDef = {
  name: "applications",
  table: "applications",
  schema: S.applicationSchema,
  refs: { person_id: "people" },
  order: "CASE status WHEN 'interviewing' THEN 0 WHEN 'offer' THEN 1 WHEN 'applied' THEN 2 WHEN 'wishlist' THEN 3 ELSE 4 END, next_step_on IS NULL, next_step_on",
  filters: ["status"],
  searchColumns: ["company", "role", "notes"],
};

const accounts: ResourceDef = {
  name: "accounts",
  table: "financial_accounts",
  schema: S.accountSchema,
  bools: ["include_in_net_worth", "archived"],
  order: "archived, name",
  filters: ["archived", "kind"],
};

const transactions: ResourceDef = {
  name: "transactions",
  table: "transactions",
  schema: S.transactionSchema,
  refs: { account_id: "financial_accounts", to_account_id: "financial_accounts" },
  order: "occurred_on DESC, created_at DESC",
  filters: ["account_id", "kind", "category"],
  dateField: "occurred_on",
  searchColumns: ["note", "category"],
  beforeWrite: (_ctx, d) => {
    if (d.kind === "transfer") {
      if (!d.to_account_id) throw badRequest("Choose the account you're transferring to.");
      if (d.to_account_id === d.account_id) throw badRequest("Transfer to a different account.");
    } else d.to_account_id = null;
  },
};

const budgets: ResourceDef = {
  name: "budgets",
  table: "budgets",
  schema: S.budgetSchema,
  upsertOn: ["category"],
  order: "category",
};

const subscriptions: ResourceDef = {
  name: "subscriptions",
  table: "subscriptions",
  schema: S.subscriptionSchema,
  bools: ["active"],
  order: "active DESC, next_renewal IS NULL, next_renewal",
  filters: ["active"],
  searchColumns: ["name"],
};

const financialGoals: ResourceDef = {
  name: "financial-goals",
  table: "financial_goals",
  schema: S.financialGoalSchema,
  refs: { account_id: "financial_accounts", goal_id: "goals" },
  order: "deadline IS NULL, deadline, created_at",
  filters: ["goal_id"],
};

const people: ResourceDef = {
  name: "people",
  table: "people",
  schema: S.personSchema,
  bools: ["important"],
  order: "important DESC, name",
  filters: ["relation", "important"],
  searchColumns: ["name", "notes", "follow_up"],
  decorate: (ctx, rows) => {
    if (!rows.length) return;
    const last = new Map(
      (
        ctx.db.prepare("SELECT person_id, MAX(occurred_on) AS last FROM interactions WHERE user_id = ? GROUP BY person_id").all(ctx.userId) as {
          person_id: string;
          last: string;
        }[]
      ).map((r) => [r.person_id, r.last]),
    );
    for (const r of rows) r.last_interaction = last.get(r.id as string) ?? null;
  },
};

const interactions: ResourceDef = {
  name: "interactions",
  table: "interactions",
  schema: S.interactionSchema,
  refs: { person_id: "people" },
  order: "occurred_on DESC, created_at DESC",
  filters: ["person_id", "kind"],
  dateField: "occurred_on",
  beforeWrite: (ctx, d) => {
    if ((d.occurred_on as string) > ctx.today) throw badRequest("Interactions are logged after they happen — use a task for plans.");
  },
};

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

const notes: ResourceDef = {
  name: "notes",
  table: "notes",
  schema: S.noteSchema,
  bools: ["pinned"],
  order: "pinned DESC, updated_at DESC",
  filters: ["folder", "pinned"],
  searchColumns: ["title", "body"],
  afterWrite: (ctx, row, _existing, input) => {
    const id = row.id as string;
    if (Array.isArray(input.tags)) {
      ctx.db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(id);
      for (const name of [...new Set(input.tags as string[])]) {
        let tag = ctx.db.prepare("SELECT id FROM tags WHERE user_id = ? AND name = ?").get(ctx.userId, name) as { id: string } | undefined;
        if (!tag) {
          tag = { id: newId() };
          const now = nowIso();
          ctx.db.prepare("INSERT INTO tags (id, user_id, is_demo, created_at, updated_at, name) VALUES (?, ?, ?, ?, ?, ?)").run(tag.id, ctx.userId, ctx.isDemo ? 1 : 0, now, now, name);
        }
        ctx.db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)").run(id, tag.id);
      }
      // Remove tags no longer used by any note.
      ctx.db.prepare("DELETE FROM tags WHERE user_id = ? AND id NOT IN (SELECT tag_id FROM note_tags)").run(ctx.userId);
    }
    if (Array.isArray(input.links)) {
      ctx.db.prepare("DELETE FROM note_links WHERE note_id = ?").run(id);
      for (const l of input.links as { entity_type: string; entity_id: string }[]) {
        const table = LINK_TABLES[l.entity_type];
        const ok = ctx.db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(l.entity_id, ctx.userId);
        if (!ok) throw badRequest("Linked item not found");
        ctx.db.prepare("INSERT OR IGNORE INTO note_links (note_id, entity_type, entity_id) VALUES (?, ?, ?)").run(id, l.entity_type, l.entity_id);
      }
    }
  },
  decorate: (ctx, rows) => {
    if (!rows.length) return;
    const tagRows = ctx.db
      .prepare("SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE t.user_id = ? ORDER BY t.name")
      .all(ctx.userId) as { note_id: string; name: string }[];
    const linkRows = ctx.db
      .prepare("SELECT l.note_id, l.entity_type, l.entity_id FROM note_links l JOIN notes n ON n.id = l.note_id WHERE n.user_id = ?")
      .all(ctx.userId) as { note_id: string; entity_type: string; entity_id: string }[];
    const tagMap = new Map<string, string[]>();
    for (const t of tagRows) tagMap.set(t.note_id, [...(tagMap.get(t.note_id) ?? []), t.name]);
    const linkMap = new Map<string, { entity_type: string; entity_id: string }[]>();
    for (const l of linkRows) linkMap.set(l.note_id, [...(linkMap.get(l.note_id) ?? []), { entity_type: l.entity_type, entity_id: l.entity_id }]);
    for (const r of rows) {
      r.tags = tagMap.get(r.id as string) ?? [];
      r.links = linkMap.get(r.id as string) ?? [];
    }
  },
};

const checkins: ResourceDef = {
  name: "checkins",
  table: "checkins",
  schema: S.checkinSchema,
  json: ["emotions"],
  bools: ["rest_day"],
  upsertOn: ["entry_date"],
  immutable: ["entry_date"],
  order: "entry_date DESC",
  filters: ["entry_date"],
  dateField: "entry_date",
  beforeWrite: (ctx, d) => {
    if ((d.entry_date as string) > ctx.today) throw badRequest("Check-ins are for today or earlier.");
  },
};

const workouts: ResourceDef = {
  name: "workouts",
  table: "workouts",
  schema: S.workoutSchema,
  order: "occurred_on DESC, created_at DESC",
  filters: ["kind"],
  dateField: "occurred_on",
};

const metrics: ResourceDef = {
  name: "metrics",
  table: "metrics",
  schema: S.metricSchema,
  refs: { life_area_id: "life_areas" },
  bools: ["active"],
  order: "active DESC, name",
  filters: ["active", "life_area_id"],
};

const metricEntries: ResourceDef = {
  name: "metric-entries",
  table: "metric_entries",
  schema: S.metricEntrySchema,
  refs: { metric_id: "metrics" },
  upsertOn: ["metric_id", "entry_date"],
  order: "entry_date DESC",
  filters: ["metric_id"],
  dateField: "entry_date",
};

const environmentChecks: ResourceDef = {
  name: "environment-checks",
  table: "environment_checks",
  schema: S.environmentCheckSchema,
  order: "checked_on DESC, created_at DESC",
  filters: ["area"],
  dateField: "checked_on",
};

export const RESOURCES: ResourceDef[] = [
  lifeAreas,
  values,
  goals,
  milestones,
  projects,
  tasks,
  habits,
  habitLogs,
  events,
  focusSessions,
  distractions,
  journal,
  decisions,
  decisionReviews,
  reviews,
  subjects,
  topics,
  learningResources,
  flashcards,
  assessments,
  skills,
  skillEvidence,
  applications,
  accounts,
  transactions,
  budgets,
  subscriptions,
  financialGoals,
  people,
  interactions,
  notes,
  checkins,
  workouts,
  metrics,
  metricEntries,
  environmentChecks,
];

export const RESOURCE_BY_NAME = new Map(RESOURCES.map((r) => [r.name, r]));
export const R = Object.fromEntries(RESOURCES.map((r) => [r.table, r])) as Record<string, ResourceDef>;
