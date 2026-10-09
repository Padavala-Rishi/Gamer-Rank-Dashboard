import { CURRENCIES, LEAD_STATUSES, LEAD_STATUS_LABEL, PROJECT_STAGES, PROJECT_STAGE_LABEL, SKILLS, SKILL_LABEL, TRACKS } from "./constants";

export type Opt = { value: string; label: string };
export type FieldDef = {
  name: string; label: string;
  type: "text" | "textarea" | "number" | "date" | "time" | "select" | "checkbox" | "weekdays" | "tags" | "url" | "list";
  options?: Opt[]; required?: boolean; placeholder?: string; hint?: string; step?: number | string; min?: number; max?: number;
  half?: boolean; defaultValue?: unknown;
  /** list: the columns of each row */
  columns?: { name: string; label: string; type: "text" | "number"; placeholder?: string; suggestions?: string[]; width?: string }[];
};

const opts = (xs: readonly string[], labels?: Record<string, string>): Opt[] => xs.map((x) => ({ value: x, label: labels?.[x] ?? x }));

export const DRILL_FIELDS: FieldDef[] = [
  { name: "name", label: "Drill name", type: "text", required: true, placeholder: "e.g. Two-ball dribbling" },
  { name: "skill", label: "Skill", type: "select", options: opts(SKILLS, SKILL_LABEL), defaultValue: "ball_handling", half: true },
  { name: "default_minutes", label: "Minutes", type: "number", min: 1, max: 240, half: true },
  { name: "default_reps", label: "Repetitions", type: "number", min: 1, max: 2000, half: true },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const planFields = (drillNames: string[]): FieldDef[] => [
  { name: "name", label: "Plan name", type: "text", required: true, placeholder: "e.g. Guard skills" },
  { name: "weekdays", label: "Training days", type: "weekdays", hint: "Not every drill suits every day: make a plan per kind of day." },
  { name: "items", label: "Drills", type: "list", columns: [
    { name: "name", label: "Drill", type: "text", placeholder: "Drill", suggestions: drillNames, width: "1fr" },
    { name: "minutes", label: "Min", type: "number", width: "4.5rem" }, { name: "reps", label: "Reps", type: "number", width: "4.5rem" },
  ] },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const METRIC_FIELDS: FieldDef[] = [
  { name: "name", label: "Metric name", type: "text", required: true, placeholder: "e.g. Corner threes, Lane sprint time" },
  { name: "kind", label: "Type", type: "select", options: [{ value: "shooting", label: "Shooting (makes / attempts)" }, { value: "value", label: "Single value (time, count…)" }], defaultValue: "shooting", half: true },
  { name: "direction", label: "Better when", type: "select", options: [{ value: "higher", label: "Higher" }, { value: "lower", label: "Lower (e.g. time)" }], defaultValue: "higher", half: true },
  { name: "unit", label: "Unit", type: "text", placeholder: "s, reps, %…", half: true },
];

export const subjectFields: FieldDef[] = [
  { name: "name", label: "Subject", type: "text", required: true, placeholder: "e.g. Operating Systems" },
  { name: "code", label: "Code", type: "text", half: true, placeholder: "CS301" },
  { name: "weekly_target_min", label: "Weekly study target (min)", type: "number", min: 0, max: 3000, defaultValue: 180, half: true },
];

export const examFields = (subjects: Opt[]): FieldDef[] => [
  { name: "title", label: "Exam", type: "text", required: true, placeholder: "e.g. Mid-term" },
  { name: "subject_id", label: "Subject", type: "select", options: [{ value: "", label: "None" }, ...subjects], half: true },
  { name: "exam_date", label: "Date", type: "date", required: true, half: true },
  { name: "exam_time", label: "Time", type: "time", half: true },
  { name: "location", label: "Location", type: "text", half: true },
  { name: "weight_pct", label: "Weight (% of grade)", type: "number", min: 0, max: 100, half: true },
  { name: "status", label: "Status", type: "select", options: [{ value: "upcoming", label: "Upcoming" }, { value: "taken", label: "Taken" }], defaultValue: "upcoming", half: true },
  { name: "score_pct", label: "Score (%)", type: "number", min: 0, max: 100, half: true, hint: "After you get the result" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const syllabusFields = (subjectId: string, parents: Opt[]): FieldDef[] => [
  { name: "title", label: "Title", type: "text", required: true, placeholder: "e.g. Process scheduling" },
  { name: "kind", label: "Level", type: "select", options: [{ value: "unit", label: "Unit" }, { value: "topic", label: "Topic" }, { value: "subtopic", label: "Subtopic" }], defaultValue: "topic", half: true },
  { name: "parent_id", label: "Inside", type: "select", options: [{ value: "", label: "Top level" }, ...parents], half: true },
  { name: "notes", label: "Notes", type: "textarea" },
  { name: "subject_id", label: "", type: "text", defaultValue: subjectId },
];

export const projectFields: FieldDef[] = [
  { name: "name", label: "Project", type: "text", required: true, placeholder: "e.g. Habit tracker API" },
  { name: "stage", label: "Stage", type: "select", options: opts(PROJECT_STAGES, PROJECT_STAGE_LABEL), defaultValue: "planned", half: true },
  { name: "is_client_work", label: "Client work", type: "checkbox", half: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "repo_url", label: "Repository URL", type: "url", placeholder: "https://github.com/…" },
  { name: "live_url", label: "Live demo URL", type: "url", placeholder: "https://…" },
  { name: "skills", label: "Skills (comma separated)", type: "tags", placeholder: "React, Postgres, Tailwind" },
  { name: "features_total", label: "Features planned", type: "number", min: 0, max: 500, defaultValue: 0, half: true },
  { name: "features_done", label: "Features done", type: "number", min: 0, max: 500, defaultValue: 0, half: true },
  { name: "started_on", label: "Started", type: "date", half: true },
  { name: "deployed_on", label: "Deployed", type: "date", half: true },
];

export const roadmapFields = (track?: string): FieldDef[] => [
  { name: "title", label: "Milestone", type: "text", required: true, placeholder: "e.g. Build a CRUD API with auth" },
  { name: "track", label: "Track", type: "select", options: TRACKS.map((t) => ({ value: t.key, label: t.label })), defaultValue: track ?? "web_basics" },
  { name: "status", label: "Status", type: "select", options: [{ value: "todo", label: "To do" }, { value: "doing", label: "In progress" }, { value: "done", label: "Done" }], defaultValue: "todo", half: true },
  { name: "resource_url", label: "Resource link", type: "url", half: true },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const leadFields: FieldDef[] = [
  { name: "name", label: "Contact / lead", type: "text", required: true, placeholder: "e.g. Priya at Bloom Bakery" },
  { name: "company", label: "Company", type: "text", half: true },
  { name: "channel", label: "Channel", type: "text", half: true, placeholder: "Email, Instagram, LinkedIn…" },
  { name: "contact", label: "Contact details", type: "text" },
  { name: "status", label: "Status", type: "select", options: opts(LEAD_STATUSES, LEAD_STATUS_LABEL), defaultValue: "identified", half: true },
  { name: "next_followup_on", label: "Follow up on", type: "date", half: true },
  { name: "expected_value", label: "Expected value", type: "number", min: 0, step: "any", half: true, hint: "An expectation, not income" },
  { name: "currency", label: "Currency", type: "select", options: opts(CURRENCIES), defaultValue: "INR", half: true },
  { name: "lost_reason", label: "If lost, why?", type: "text" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const outreachFields = (leadId: string): FieldDef[] => [
  { name: "lead_id", label: "", type: "text", defaultValue: leadId },
  { name: "kind", label: "What happened", type: "select", options: [{ value: "message", label: "Sent a message" }, { value: "followup", label: "Followed up" }, { value: "proposal", label: "Sent a proposal" }, { value: "reply", label: "They replied" }, { value: "meeting", label: "Had a meeting" }, { value: "note", label: "Note" }], defaultValue: "message", half: true },
  { name: "occurred_on", label: "Date", type: "date", required: true, half: true },
  { name: "summary", label: "Summary", type: "textarea" },
];

export const invoiceFields = (leads: Opt[], projects: Opt[], today: string, currency: string): FieldDef[] => [
  { name: "kind", label: "", type: "text", defaultValue: "invoice" },
  { name: "client", label: "Client", type: "text", placeholder: "Who is this for?" },
  { name: "amount", label: "Invoiced amount", type: "number", required: true, min: 0, step: "any", half: true },
  { name: "currency", label: "Currency", type: "select", options: opts(CURRENCIES), defaultValue: currency, half: true },
  { name: "occurred_on", label: "Invoice date", type: "date", required: true, defaultValue: today, half: true },
  { name: "due_on", label: "Due date", type: "date", half: true },
  { name: "lead_id", label: "Lead", type: "select", options: [{ value: "", label: "None" }, ...leads], half: true },
  { name: "project_id", label: "Project", type: "select", options: [{ value: "", label: "None" }, ...projects], half: true },
  { name: "note", label: "Note", type: "text" },
];

export const paymentFields = (invoices: Opt[], today: string, currency: string): FieldDef[] => [
  { name: "kind", label: "", type: "text", defaultValue: "payment" },
  { name: "amount", label: "Amount received", type: "number", required: true, min: 0, step: "any", half: true, hint: "Only record money that actually arrived." },
  { name: "currency", label: "Currency", type: "select", options: opts(CURRENCIES), defaultValue: currency, half: true },
  { name: "occurred_on", label: "Date received", type: "date", required: true, defaultValue: today, half: true },
  { name: "invoice_id", label: "Against invoice", type: "select", options: [{ value: "", label: "None (standalone payment)" }, ...invoices], half: true },
  { name: "client", label: "From", type: "text" },
  { name: "note", label: "Note", type: "text" },
];

export const routineFields: FieldDef[] = [
  { name: "name", label: "Routine name", type: "text", required: true, placeholder: "e.g. Push day" },
  { name: "weekdays", label: "Days", type: "weekdays" },
  { name: "exercises", label: "Exercises", type: "list", columns: [
    { name: "name", label: "Exercise", type: "text", placeholder: "Exercise", width: "1fr" },
    { name: "sets", label: "Sets", type: "number", width: "4rem" }, { name: "reps", label: "Reps", type: "number", width: "4rem" }, { name: "weight_kg", label: "kg", type: "number", width: "4.5rem" },
  ] },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const bodyFields = (today: string): FieldDef[] => [
  { name: "kind", label: "Measurement", type: "text", required: true, defaultValue: "bodyweight", placeholder: "bodyweight, waist, chest, arm…", hint: "“bodyweight” feeds your trend chart. Add any measurement you like." },
  { name: "value", label: "Value", type: "number", required: true, min: 0, step: "any", half: true },
  { name: "unit", label: "Unit", type: "text", defaultValue: "kg", half: true },
  { name: "logged_on", label: "Date", type: "date", required: true, defaultValue: today },
];

export const mealFields = (today: string): FieldDef[] => [
  { name: "label", label: "Meal", type: "text", defaultValue: "Meal", placeholder: "Breakfast, shake…" },
  { name: "protein_g", label: "Protein (g)", type: "number", required: true, min: 0, max: 500, step: "any", half: true },
  { name: "calories", label: "Calories", type: "number", min: 0, max: 10000, half: true },
  { name: "logged_on", label: "Date", type: "date", required: true, defaultValue: today },
];

export const rewardFields = (achievements: Opt[]): FieldDef[] => [
  { name: "title", label: "Reward", type: "text", required: true, placeholder: "e.g. New basketball shoes" },
  { name: "unlock_kind", label: "Unlocks when you reach…", type: "select", defaultValue: "level", options: [{ value: "level", label: "An overall level" }, { value: "category_level", label: "An attribute level" }, { value: "streak", label: "A best streak (days)" }, { value: "xp", label: "Total XP" }, { value: "achievement", label: "An achievement" }] },
  { name: "unlock_value", label: "Target number", type: "number", min: 1, half: true, hint: "Level, days or XP" },
  { name: "unlock_category", label: "Attribute", type: "select", options: [{ value: "", label: "—" }, { value: "basketball", label: "Basketball" }, { value: "college", label: "College" }, { value: "dev", label: "Development" }, { value: "health", label: "Health & Physique" }], half: true },
  { name: "unlock_key", label: "Achievement", type: "select", options: [{ value: "", label: "—" }, ...achievements] },
  { name: "note", label: "Why it matters", type: "text" },
];
