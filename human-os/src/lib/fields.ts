import * as C from "../../shared/constants";
import type { FieldSpec } from "../components/ResourceForm";

const opts = (arr: string[]) => arr.map((x) => [x, x] as const);

export const RECURRENCE_OPTIONS = [
  ["daily", "Every day"],
  ["weekdays", "Every weekday"],
  ["weekly:1", "Weekly (Mon)"],
  ["weekly:2", "Weekly (Tue)"],
  ["weekly:3", "Weekly (Wed)"],
  ["weekly:4", "Weekly (Thu)"],
  ["weekly:5", "Weekly (Fri)"],
  ["weekly:6", "Weekly (Sat)"],
  ["weekly:0", "Weekly (Sun)"],
  ["weekly:1,3,5", "Mon / Wed / Fri"],
  ["weekly:2,4", "Tue / Thu"],
  ["monthly:1", "Monthly (1st)"],
  ["monthly:15", "Monthly (15th)"],
  ["every:2", "Every 2 days"],
  ["every:3", "Every 3 days"],
  ["every:14", "Every 2 weeks"],
] as const;

export const taskFields: FieldSpec[] = [
  { name: "title", label: "Task", type: "text", full: true, placeholder: "What needs doing?" },
  { name: "priority", label: "Priority", type: "select", options: C.PRIORITIES, default: "medium" },
  { name: "status", label: "Status", type: "select", options: C.TASK_STATUSES },
  { name: "due_date", label: "Due date", type: "date" },
  { name: "due_time", label: "Due time", type: "time" },
  { name: "scheduled_date", label: "Plan to do on", type: "date", hint: "When you intend to work on it" },
  { name: "estimate_min", label: "Estimate (minutes)", type: "number", min: 1, max: 1440, step: 5 },
  { name: "energy", label: "Energy needed", type: "select", options: C.ENERGY_LEVELS, emptyLabel: "— Any —" },
  { name: "context", label: "Context", type: "text", placeholder: "e.g. computer, phone, errands" },
  { name: "project_id", label: "Project", type: "ref", ref: "projects", refFilter: (r) => r.status !== "archived" },
  { name: "goal_id", label: "Goal", type: "ref", ref: "goals", refFilter: (r) => r.status === "active" },
  { name: "life_area_id", label: "Life area", type: "ref", ref: "life-areas", refLabel: "name" },
  { name: "recurrence", label: "Repeat", type: "select", options: RECURRENCE_OPTIONS, emptyLabel: "Does not repeat" },
  { name: "first_step", label: "Smallest first step", type: "text", full: true, placeholder: "e.g. Open the doc and write one sentence", hint: "Used by 2-minute mode to make starting easy." },
  { name: "depends_on", label: "Blocked by (must finish first)", type: "refs", ref: "tasks", full: true, refFilter: (r) => r.status === "todo" || r.status === "doing" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

export const projectFields: FieldSpec[] = [
  { name: "title", label: "Project", type: "text", full: true },
  { name: "description", label: "Outcome / description", type: "textarea", full: true, placeholder: "What does done look like?" },
  { name: "status", label: "Status", type: "select", options: C.PROJECT_STATUSES, default: "active" },
  { name: "goal_id", label: "Serves goal", type: "ref", ref: "goals", refFilter: (r) => r.status === "active" },
  { name: "start_date", label: "Start", type: "date" },
  { name: "deadline", label: "Deadline", type: "date" },
  { name: "life_area_id", label: "Life area", type: "ref", ref: "life-areas", refLabel: "name" },
  { name: "color", label: "Colour", type: "color" },
  { name: "notes", label: "Notes", type: "textarea", full: true, rows: 4 },
];

export const goalFields: FieldSpec[] = [
  { name: "title", label: "Goal", type: "text", full: true, placeholder: "e.g. Run a 5k under 28 minutes" },
  { name: "why", label: "Why it matters", type: "textarea", full: true, serif: true, hint: "The reason you'll remember on hard days." },
  { name: "horizon", label: "Horizon", type: "select", options: C.GOAL_HORIZONS, default: "quarter" },
  { name: "kind", label: "Type", type: "select", options: C.GOAL_KINDS },
  { name: "parent_id", label: "Part of (parent goal)", type: "ref", ref: "goals", refFilter: (r) => r.status === "active" },
  { name: "life_area_id", label: "Life area", type: "ref", ref: "life-areas", refLabel: "name" },
  { name: "start_date", label: "Start", type: "date" },
  { name: "deadline", label: "Deadline", type: "date" },
  { name: "status", label: "Status", type: "select", options: C.GOAL_STATUSES },
  { name: "is_focus", label: "Current focus goal", type: "checkbox", hint: "Focus goals get priority in planning. Keep it to 1–3." },
  { name: "progress_mode", label: "Measure progress by", type: "select", options: C.PROGRESS_MODES, full: true },
  { name: "metric_name", label: "Metric", type: "text", placeholder: "e.g. 5k time", showIf: (v) => v.progress_mode === "metric" },
  { name: "metric_unit", label: "Unit", type: "text", placeholder: "e.g. minutes", showIf: (v) => v.progress_mode === "metric" },
  { name: "metric_start", label: "Starting value", type: "number", showIf: (v) => v.progress_mode === "metric" },
  { name: "metric_current", label: "Current value", type: "number", showIf: (v) => v.progress_mode === "metric" },
  { name: "metric_target", label: "Target value", type: "number", showIf: (v) => v.progress_mode === "metric" },
  { name: "manual_progress", label: "Progress estimate (%)", type: "number", min: 0, max: 100, showIf: (v) => v.progress_mode === "manual" },
  { name: "value_ids", label: "Connected values", type: "refs", ref: "values", refLabel: "name", full: true },
  { name: "description", label: "Description (what does done look like?)", type: "textarea", full: true },
  { name: "risks", label: "Risks & obstacles", type: "textarea", full: true, rows: 2 },
  { name: "dependencies", label: "Dependencies", type: "textarea", full: true, rows: 2 },
];

export const milestoneFields: FieldSpec[] = [
  { name: "title", label: "Milestone", type: "text", full: true },
  { name: "due_date", label: "Target date", type: "date" },
];

export const habitFields: FieldSpec[] = [
  { name: "title", label: "Habit", type: "text", full: true, placeholder: "e.g. Study Python" },
  { name: "frequency", label: "Frequency", type: "select", options: C.HABIT_FREQUENCIES },
  { name: "times_per_week", label: "Times per week", type: "number", min: 1, max: 7, showIf: (v) => v.frequency === "weekly" },
  { name: "days", label: "Days", type: "days", full: true, showIf: (v) => v.frequency === "days" },
  { name: "minimum_value", label: "Minimum viable version", type: "number", min: 0, hint: "The version you can do even on a bad day." },
  { name: "target_value", label: "Target", type: "number", min: 0 },
  { name: "unit", label: "Unit", type: "text", placeholder: "minutes, pages, reps…" },
  { name: "cue", label: "Cue (when / where)", type: "text", placeholder: "After breakfast, at my desk" },
  { name: "goal_id", label: "Supports goal", type: "ref", ref: "goals", refFilter: (r) => r.status === "active" },
  { name: "life_area_id", label: "Life area", type: "ref", ref: "life-areas", refLabel: "name" },
  { name: "description", label: "Notes", type: "textarea", full: true, rows: 2 },
  { name: "paused", label: "Paused", type: "checkbox", hint: "Paused habits aren't scheduled and don't affect streaks." },
];

export const subjectFields: FieldSpec[] = [
  { name: "title", label: "Subject or course", type: "text", full: true },
  { name: "kind", label: "Type", type: "select", options: C.SUBJECT_KINDS },
  { name: "status", label: "Status", type: "select", options: C.LEARNING_STATUSES },
  { name: "provider", label: "Provider / teacher", type: "text" },
  { name: "weekly_target_min", label: "Weekly study target (min)", type: "number", min: 0 },
  { name: "goal_id", label: "Learning goal", type: "ref", ref: "goals", refFilter: (r) => r.status === "active" },
  { name: "life_area_id", label: "Life area", type: "ref", ref: "life-areas", refLabel: "name" },
  { name: "color", label: "Colour", type: "color" },
  { name: "description", label: "Description", type: "textarea", full: true },
];

export const topicFields: FieldSpec[] = [
  { name: "title", label: "Topic", type: "text", full: true },
  { name: "mastery", label: "Mastery", type: "select", options: C.MASTERY_LEVELS, default: "0" },
  { name: "next_review", label: "Next revision", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

export const resourceFields: FieldSpec[] = [
  { name: "title", label: "Resource", type: "text", full: true },
  { name: "kind", label: "Type", type: "select", options: C.RESOURCE_KINDS, default: "other" },
  { name: "status", label: "Status", type: "select", options: C.RESOURCE_STATUSES },
  { name: "url", label: "Link", type: "url", full: true, placeholder: "https://" },
  { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
];

export const flashcardFields: FieldSpec[] = [
  { name: "front", label: "Question", type: "textarea", full: true, rows: 2 },
  { name: "back", label: "Answer", type: "textarea", full: true, rows: 3 },
];

export const assessmentFields: FieldSpec[] = [
  { name: "title", label: "Title", type: "text", full: true },
  { name: "kind", label: "Type", type: "select", options: C.ASSESSMENT_KINDS },
  { name: "status", label: "Status", type: "select", options: C.ASSESSMENT_STATUSES },
  { name: "due_date", label: "Date", type: "date", today: true },
  { name: "due_time", label: "Time", type: "time" },
  { name: "subject_id", label: "Subject", type: "ref", ref: "subjects" },
  { name: "weight", label: "Weight (%)", type: "number", min: 0, max: 100 },
  { name: "score", label: "Score", type: "number", showIf: (v) => v.status === "graded" },
  { name: "max_score", label: "Out of", type: "number", showIf: (v) => v.status === "graded" },
  { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
];

export const skillFields: FieldSpec[] = [
  { name: "title", label: "Skill", type: "text", full: true },
  { name: "domain", label: "Kind", type: "select", options: C.SKILL_DOMAINS },
  { name: "category", label: "Category", type: "text", placeholder: "e.g. Languages, Communication" },
  { name: "current_level", label: "Current level", type: "select", options: C.SKILL_LEVELS },
  { name: "target_level", label: "Target level", type: "select", options: C.SKILL_LEVELS, default: "3" },
  { name: "goal_id", label: "Serves goal", type: "ref", ref: "goals", refFilter: (r) => r.status === "active" },
  { name: "prerequisite_ids", label: "Prerequisites", type: "refs", ref: "skills", full: true },
  { name: "description", label: "What does mastery look like?", type: "textarea", full: true },
];

export const evidenceFields: FieldSpec[] = [
  { name: "title", label: "Evidence", type: "text", full: true, placeholder: "Project, certificate, practice session…" },
  { name: "kind", label: "Type", type: "select", options: C.EVIDENCE_KINDS },
  { name: "occurred_on", label: "Date", type: "date", today: true },
  { name: "minutes", label: "Time spent (min)", type: "number", min: 0 },
  { name: "url", label: "Link", type: "url", placeholder: "https://" },
  { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
];

export const applicationFields: FieldSpec[] = [
  { name: "company", label: "Company", type: "text" },
  { name: "role", label: "Role", type: "text" },
  { name: "status", label: "Status", type: "select", options: C.APPLICATION_STATUSES },
  { name: "applied_on", label: "Applied on", type: "date" },
  { name: "next_step", label: "Next step", type: "text" },
  { name: "next_step_on", label: "Next step date", type: "date" },
  { name: "person_id", label: "Contact", type: "ref", ref: "people", refLabel: "name" },
  { name: "url", label: "Link", type: "url", placeholder: "https://" },
  { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
];

export const accountFields: FieldSpec[] = [
  { name: "name", label: "Account", type: "text" },
  { name: "kind", label: "Type", type: "select", options: C.ACCOUNT_KINDS, default: "checking" },
  { name: "opening_balance", label: "Balance when added", type: "number", hint: "For loans and credit cards, enter the amount owed." },
  { name: "include_in_net_worth", label: "Include in net worth", type: "checkbox", default: true },
  { name: "archived", label: "Archived", type: "checkbox" },
  { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
];

export const transactionFields: FieldSpec[] = [
  { name: "kind", label: "Type", type: "select", options: C.TRANSACTION_KINDS },
  { name: "amount", label: "Amount", type: "number", min: 0, step: 0.01 },
  { name: "account_id", label: "Account", type: "ref", ref: "accounts", refLabel: "name", emptyLabel: "— Choose —" },
  { name: "to_account_id", label: "To account", type: "ref", ref: "accounts", refLabel: "name", showIf: (v) => v.kind === "transfer" },
  { name: "occurred_on", label: "Date", type: "date", today: true },
  { name: "category", label: "Category", type: "select", options: opts([...C.EXPENSE_CATEGORIES, ...C.INCOME_CATEGORIES.filter((c) => c !== "Other")]), emptyLabel: "— None —", showIf: (v) => v.kind !== "transfer" },
  { name: "note", label: "Note", type: "text", full: true },
];

export const budgetFields: FieldSpec[] = [
  { name: "category", label: "Category", type: "select", options: opts(C.EXPENSE_CATEGORIES) },
  { name: "monthly_limit", label: "Monthly limit", type: "number", min: 0 },
];

export const subscriptionFields: FieldSpec[] = [
  { name: "name", label: "Subscription", type: "text" },
  { name: "amount", label: "Amount", type: "number", min: 0, step: 0.01 },
  { name: "cycle", label: "Billing", type: "select", options: C.BILLING_CYCLES, default: "monthly" },
  { name: "next_renewal", label: "Next renewal", type: "date" },
  { name: "category", label: "Category", type: "select", options: opts(C.EXPENSE_CATEGORIES), emptyLabel: "— None —" },
  { name: "active", label: "Active", type: "checkbox", default: true },
];

export const finGoalFields: FieldSpec[] = [
  { name: "title", label: "Financial goal", type: "text", full: true },
  { name: "kind", label: "Type", type: "select", options: C.FIN_GOAL_KINDS },
  { name: "target_amount", label: "Target amount", type: "number", min: 0 },
  { name: "account_id", label: "Tracked by account", type: "ref", ref: "accounts", refLabel: "name", hint: "Progress follows this account's balance." },
  { name: "current_amount", label: "Current amount", type: "number", showIf: (v) => !v.account_id && v.kind !== "net_worth" },
  { name: "monthly_contribution", label: "Monthly contribution", type: "number", min: 0 },
  { name: "deadline", label: "Target date", type: "date" },
  { name: "goal_id", label: "Linked life goal", type: "ref", ref: "goals" },
  { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
];

export const personFields: FieldSpec[] = [
  { name: "name", label: "Name", type: "text" },
  { name: "relation", label: "Relationship", type: "select", options: C.RELATIONS, default: "friend" },
  { name: "birthday", label: "Birthday", type: "date" },
  { name: "contact_every_days", label: "Stay in touch every (days)", type: "number", min: 1, hint: "Leave empty for no reminder." },
  { name: "important", label: "One of my most important people", type: "checkbox", full: true },
  { name: "how_to_reach", label: "How to reach", type: "text", full: true },
  { name: "follow_up", label: "Follow up on", type: "text", full: true, placeholder: "e.g. Ask how the interview went" },
  { name: "notes", label: "Notes", type: "textarea", full: true, rows: 3 },
];

export const interactionFields: FieldSpec[] = [
  { name: "occurred_on", label: "Date", type: "date", today: true },
  { name: "kind", label: "How", type: "select", options: C.INTERACTION_KINDS, default: "message" },
  { name: "note", label: "Note", type: "textarea", full: true, rows: 2 },
];

export const workoutFields: FieldSpec[] = [
  { name: "occurred_on", label: "Date", type: "date", today: true },
  { name: "kind", label: "Type", type: "select", options: C.WORKOUT_KINDS },
  { name: "duration_min", label: "Duration (min)", type: "number", min: 1 },
  { name: "intensity", label: "Intensity", type: "select", options: C.INTENSITIES, default: "moderate" },
  { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
];

export const metricFields: FieldSpec[] = [
  { name: "name", label: "Metric", type: "text", placeholder: "e.g. Resting heart rate" },
  { name: "unit", label: "Unit", type: "text" },
  { name: "kind", label: "Type", type: "select", options: C.METRIC_KINDS },
  { name: "direction", label: "Direction", type: "select", options: C.METRIC_DIRECTIONS },
  { name: "target", label: "Target", type: "number" },
  { name: "life_area_id", label: "Life area", type: "ref", ref: "life-areas", refLabel: "name" },
  { name: "active", label: "Active", type: "checkbox", default: true },
];

export const environmentFields: FieldSpec[] = [
  { name: "area", label: "Area", type: "select", options: C.ENVIRONMENT_AREAS },
  { name: "checked_on", label: "Date", type: "date", today: true },
  { name: "rating", label: "How supportive is it? (1–5)", type: "scale", full: true },
  { name: "note", label: "What's getting in the way?", type: "textarea", full: true, rows: 2 },
  { name: "change_idea", label: "One change to try", type: "text", full: true },
];

export const decisionFields: FieldSpec[] = [
  { name: "title", label: "Decision", type: "text", full: true },
  { name: "decided_on", label: "Date", type: "date", today: true },
  { name: "review_on", label: "Review on", type: "date", hint: "When you'll compare prediction with reality." },
  { name: "context", label: "Context", type: "textarea", full: true, rows: 2 },
  { name: "options", label: "Options considered", type: "textarea", full: true, rows: 3 },
  { name: "chosen", label: "What I chose", type: "text", full: true },
  { name: "reasoning", label: "Reasoning", type: "textarea", full: true, rows: 3 },
  { name: "assumptions", label: "Assumptions", type: "textarea", full: true, rows: 2 },
  { name: "risks", label: "Risks", type: "textarea", full: true, rows: 2 },
  { name: "expected_outcome", label: "Expected outcome (prediction)", type: "textarea", full: true, rows: 2 },
  { name: "confidence", label: "Confidence (%)", type: "number", min: 0, max: 100 },
  { name: "life_area_id", label: "Life area", type: "ref", ref: "life-areas", refLabel: "name" },
];

export const decisionReviewFields: FieldSpec[] = [
  { name: "reviewed_on", label: "Date", type: "date", today: true },
  { name: "outcome_vs_expected", label: "Compared with my prediction", type: "select", options: [["better", "Better than expected"], ["as_expected", "As expected"], ["mixed", "Mixed"], ["worse", "Worse than expected"]], default: "as_expected" },
  { name: "actual_outcome", label: "What actually happened", type: "textarea", full: true, rows: 3 },
  { name: "assumptions_held", label: "Which assumptions held or failed?", type: "textarea", full: true, rows: 2 },
  { name: "lessons", label: "Lessons", type: "textarea", full: true, rows: 2 },
  { name: "would_decide_same", label: "I'd make the same decision again", type: "checkbox", full: true },
];

export const lifeAreaFields: FieldSpec[] = [
  { name: "name", label: "Name", type: "text" },
  { name: "color", label: "Colour", type: "color" },
  { name: "focus", label: "Current state", type: "select", options: C.LIFE_AREA_FOCUS, default: "maintain" },
  { name: "archived", label: "Archived", type: "checkbox" },
  { name: "description", label: "Description", type: "textarea", full: true, rows: 2 },
];

export const valueFields: FieldSpec[] = [
  { name: "name", label: "Value", type: "text", full: true },
  { name: "description", label: "What it means to me", type: "textarea", full: true, serif: true, rows: 3 },
];
