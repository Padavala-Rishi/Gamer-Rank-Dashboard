// Validation schemas for every user-owned resource.
// The server validates all writes with these; the client derives its types from them.
import { z } from "zod";
import * as C from "./constants";
import { isValidDate, isValidTime, isValidTimeZone } from "./dates";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const nullable = <T extends z.ZodTypeAny>(t: T) => z.preprocess(emptyToNull, t.nullable()).optional();

export const reqText = (max = 200) => z.string().trim().min(1, "Required").max(max, `Max ${max} characters`);
export const optText = (max = 5000) => nullable(z.string().trim().max(max, `Max ${max} characters`));
export const dateStr = z.string().refine(isValidDate, "Invalid date (YYYY-MM-DD)");
export const optDate = nullable(dateStr);
export const timeStr = z.string().refine(isValidTime, "Invalid time (HH:MM)");
export const optTime = nullable(timeStr);
export const idStr = z.string().min(1).max(64);
export const optId = nullable(idStr);
export const instant = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date-time")
  .transform((s) => new Date(s).toISOString());
export const optInstant = nullable(instant);
export const bool = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => Boolean(v));
const intIn = (min: number, max: number) => z.coerce.number().int("Must be a whole number").min(min).max(max);
const numIn = (min: number, max: number) => z.coerce.number().refine(Number.isFinite, "Must be a number").pipe(z.number().min(min).max(max));
export const optInt = (min: number, max: number) => nullable(intIn(min, max));
export const optNum = (min = -1e12, max = 1e12) => nullable(numIn(min, max));
const money = numIn(-1e12, 1e12).transform((n) => Math.round(n * 100) / 100);
const optMoney = nullable(money);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #4f8a6e");
const url = nullable(
  z
    .string()
    .trim()
    .max(2000)
    .refine((s) => /^https?:\/\//i.test(s), "Links must start with http:// or https://"),
);
const scale5 = optInt(1, 5);
const idList = z.array(idStr).max(200).optional();

// ---------------------------------------------------------------------------
// Direction

export const lifeAreaSchema = z.object({
  name: reqText(60),
  description: optText(500),
  color: color.default("#6b7280"),
  icon: z.string().max(40).default("circle"),
  focus: z.enum(C.LIFE_AREA_FOCUS_VALUES).default("maintain"),
  sort_order: z.coerce.number().int().default(0),
  archived: bool.default(false),
});

export const valueSchema = z.object({
  name: reqText(60),
  description: optText(500),
  sort_order: z.coerce.number().int().default(0),
});

export const visionSchema = z.object({
  identity: optText(4000),
  ideal_life: optText(4000),
  what_matters: optText(4000),
  non_negotiables: optText(4000),
  success_definition: optText(4000),
  regrets: optText(4000),
  current_reality: optText(4000),
  constraints: optText(4000),
});

export const goalSchema = z.object({
  title: reqText(200),
  description: optText(4000),
  why: optText(2000),
  life_area_id: optId,
  parent_id: optId,
  horizon: z.enum(C.GOAL_HORIZON_VALUES).default("quarter"),
  kind: z.enum(C.GOAL_KIND_VALUES).default("outcome"),
  status: z.enum(C.GOAL_STATUS_VALUES).default("active"),
  is_focus: bool.default(false),
  start_date: optDate,
  deadline: optDate,
  progress_mode: z.enum(C.PROGRESS_MODE_VALUES).default("milestones"),
  metric_name: optText(80),
  metric_unit: optText(30),
  metric_start: optNum(),
  metric_current: optNum(),
  metric_target: optNum(),
  manual_progress: optInt(0, 100),
  risks: optText(2000),
  dependencies: optText(2000),
  value_ids: idList,
});

export const milestoneSchema = z.object({
  goal_id: idStr,
  title: reqText(200),
  due_date: optDate,
  completed_at: optInstant,
  sort_order: z.coerce.number().int().default(0),
});

export const projectSchema = z.object({
  title: reqText(200),
  description: optText(4000),
  goal_id: optId,
  life_area_id: optId,
  status: z.enum(C.PROJECT_STATUS_VALUES).default("active"),
  start_date: optDate,
  deadline: optDate,
  color: nullable(color),
  notes: optText(10000),
});

export const taskSchema = z.object({
  title: reqText(300),
  notes: optText(10000),
  project_id: optId,
  goal_id: optId,
  life_area_id: optId,
  parent_id: optId,
  priority: z.enum(C.PRIORITY_VALUES).default("medium"),
  status: z.enum(C.TASK_STATUS_VALUES).default("todo"),
  due_date: optDate,
  due_time: optTime,
  scheduled_date: optDate,
  mit_date: optDate,
  estimate_min: optInt(1, 24 * 60),
  actual_min: optInt(0, 100000),
  energy: nullable(z.enum(C.ENERGY_VALUES)),
  context: optText(40),
  recurrence: nullable(
    z
      .string()
      .regex(/^(daily|weekdays|weekly:[0-6](,[0-6])*|monthly:(?:[1-9]|[12]\d|3[01])|every:(?:[1-9]\d{0,2}))$/, "Invalid repeat rule"),
  ),
  first_step: optText(300),
  snoozed_until: optInstant,
  sort_order: z.coerce.number().default(0),
  depends_on: idList,
});

export const habitSchema = z.object({
  title: reqText(120),
  description: optText(2000),
  life_area_id: optId,
  goal_id: optId,
  frequency: z.enum(C.HABIT_FREQUENCY_VALUES).default("daily"),
  days: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
  times_per_week: optInt(1, 7),
  target_value: optNum(0, 100000),
  minimum_value: optNum(0, 100000),
  unit: optText(30),
  cue: optText(200),
  color: nullable(color),
  paused: bool.default(false),
  archived: bool.default(false),
  sort_order: z.coerce.number().int().default(0),
});

export const habitLogSchema = z.object({
  habit_id: idStr,
  date: dateStr,
  status: z.enum(C.HABIT_LOG_STATUS_VALUES),
  value: optNum(0, 100000),
  note: optText(500),
});

// ---------------------------------------------------------------------------
// Execution

export const eventSchema = z
  .object({
    title: reqText(200),
    kind: z.enum(C.EVENT_KIND_VALUES).default("other"),
    start_at: instant,
    end_at: instant,
    all_day: bool.default(false),
    task_id: optId,
    goal_id: optId,
    location: optText(200),
    notes: optText(4000),
    recurrence: z.enum(C.EVENT_RECURRENCE_VALUES).default("none"),
    recurrence_until: optDate,
  });

export const focusSessionSchema = z.object({
  kind: z.enum(C.FOCUS_KIND_VALUES).default("pomodoro"),
  objective: optText(300),
  task_id: optId,
  goal_id: optId,
  subject_id: optId,
  topic_id: optId,
  planned_min: intIn(1, 600).default(25),
  started_at: optInstant,
  ended_at: optInstant,
  actual_min: optInt(0, 1440),
  status: z.enum(["running", "completed", "abandoned"]).default("running"),
  accomplished: optText(2000),
  distraction_notes: optText(2000),
  change_next: optText(2000),
  quality: scale5,
});

export const distractionSchema = z.object({
  session_id: optId,
  kind: z.enum(C.DISTRACTION_KIND_VALUES),
  note: optText(300),
  occurred_at: optInstant,
});

// ---------------------------------------------------------------------------
// Reflection

export const journalSchema = z.object({
  kind: z.enum(C.JOURNAL_KIND_VALUES).default("free"),
  entry_date: dateStr,
  title: optText(200),
  body: optText(50000),
  answers: z.record(z.string().max(200), z.string().max(10000)).default({}),
  mood: scale5,
  goal_id: optId,
});

export const decisionSchema = z.object({
  title: reqText(200),
  context: optText(4000),
  options: optText(4000),
  chosen: optText(1000),
  reasoning: optText(4000),
  assumptions: optText(4000),
  risks: optText(4000),
  expected_outcome: optText(4000),
  confidence: optInt(0, 100),
  decided_on: dateStr,
  review_on: optDate,
  life_area_id: optId,
  status: z.enum(["open", "reviewed"]).default("open"),
});

export const decisionReviewSchema = z.object({
  decision_id: idStr,
  reviewed_on: dateStr,
  actual_outcome: optText(4000),
  outcome_vs_expected: z.enum(["better", "as_expected", "worse", "mixed"]).default("as_expected"),
  assumptions_held: optText(2000),
  lessons: optText(4000),
  would_decide_same: nullable(bool),
});

export const reviewSchema = z.object({
  kind: z.enum(C.REVIEW_KIND_VALUES),
  period_start: dateStr,
  period_end: dateStr,
  answers: z.record(z.string().max(300), z.string().max(10000)).default({}),
  priorities: z.array(z.string().trim().max(300)).max(20).default([]),
  goal_decisions: z.record(idStr, z.enum(["keep", "change", "drop"])).default({}),
  snapshot: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["draft", "done"]).default("draft"),
});

// ---------------------------------------------------------------------------
// Learning

export const subjectSchema = z.object({
  title: reqText(120),
  kind: z.enum(C.SUBJECT_KIND_VALUES).default("subject"),
  description: optText(4000),
  provider: optText(120),
  goal_id: optId,
  life_area_id: optId,
  color: nullable(color),
  status: z.enum(C.LEARNING_STATUS_VALUES).default("active"),
  weekly_target_min: optInt(0, 10000),
});

export const topicSchema = z.object({
  subject_id: idStr,
  title: reqText(200),
  mastery: intIn(0, 4).default(0),
  notes: optText(10000),
  sort_order: z.coerce.number().int().default(0),
  next_review: optDate,
});

export const resourceSchema = z.object({
  subject_id: idStr,
  topic_id: optId,
  title: reqText(200),
  url,
  kind: z.enum(C.RESOURCE_KIND_VALUES).default("other"),
  status: z.enum(C.RESOURCE_STATUS_VALUES).default("todo"),
  notes: optText(4000),
});

export const flashcardSchema = z.object({
  subject_id: optId,
  topic_id: optId,
  front: reqText(2000),
  back: reqText(4000),
});

export const assessmentSchema = z.object({
  subject_id: optId,
  title: reqText(200),
  kind: z.enum(C.ASSESSMENT_KIND_VALUES).default("exam"),
  due_date: dateStr,
  due_time: optTime,
  weight: optNum(0, 100),
  score: optNum(0, 100000),
  max_score: optNum(0, 100000),
  status: z.enum(C.ASSESSMENT_STATUS_VALUES).default("upcoming"),
  notes: optText(4000),
});

// ---------------------------------------------------------------------------
// Career & personal development

export const skillSchema = z.object({
  title: reqText(120),
  domain: z.enum(C.SKILL_DOMAIN_VALUES).default("career"),
  category: optText(60),
  description: optText(4000),
  current_level: intIn(0, 5).default(0),
  target_level: intIn(0, 5).default(3),
  goal_id: optId,
  life_area_id: optId,
  prerequisite_ids: idList,
});

export const skillEvidenceSchema = z.object({
  skill_id: idStr,
  kind: z.enum(C.EVIDENCE_KIND_VALUES).default("practice"),
  title: reqText(200),
  url,
  occurred_on: dateStr,
  minutes: optInt(0, 10000),
  notes: optText(4000),
});

export const applicationSchema = z.object({
  company: reqText(120),
  role: reqText(120),
  status: z.enum(C.APPLICATION_STATUS_VALUES).default("wishlist"),
  applied_on: optDate,
  next_step: optText(300),
  next_step_on: optDate,
  url,
  person_id: optId,
  notes: optText(4000),
});

// ---------------------------------------------------------------------------
// Finance

export const accountSchema = z.object({
  name: reqText(80),
  kind: z.enum(C.ACCOUNT_KIND_VALUES).default("checking"),
  opening_balance: money.default(0),
  include_in_net_worth: bool.default(true),
  archived: bool.default(false),
  notes: optText(1000),
});

export const transactionSchema = z.object({
  account_id: idStr,
  to_account_id: optId,
  kind: z.enum(C.TRANSACTION_KIND_VALUES).default("expense"),
  amount: numIn(0.01, 1e12).transform((n) => Math.round(n * 100) / 100),
  occurred_on: dateStr,
  category: optText(60),
  note: optText(300),
});

export const budgetSchema = z.object({
  category: reqText(60),
  monthly_limit: numIn(0, 1e12).transform((n) => Math.round(n * 100) / 100),
});

export const subscriptionSchema = z.object({
  name: reqText(80),
  amount: numIn(0, 1e12).transform((n) => Math.round(n * 100) / 100),
  cycle: z.enum(C.BILLING_CYCLE_VALUES).default("monthly"),
  next_renewal: optDate,
  category: optText(60),
  active: bool.default(true),
  notes: optText(500),
});

export const financialGoalSchema = z.object({
  title: reqText(120),
  kind: z.enum(C.FIN_GOAL_KIND_VALUES).default("savings"),
  target_amount: numIn(0, 1e12).transform((n) => Math.round(n * 100) / 100),
  current_amount: optMoney,
  account_id: optId,
  monthly_contribution: optMoney,
  deadline: optDate,
  goal_id: optId,
  notes: optText(1000),
});

// ---------------------------------------------------------------------------
// Relationships

export const personSchema = z.object({
  name: reqText(120),
  relation: z.enum(C.RELATION_VALUES).default("friend"),
  birthday: nullable(
    z.string().refine((s) => isValidDate(s) || /^--(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s), "Use YYYY-MM-DD"),
  ),
  contact_every_days: optInt(1, 3650),
  important: bool.default(false),
  how_to_reach: optText(200),
  notes: optText(10000),
  follow_up: optText(1000),
});

export const interactionSchema = z.object({
  person_id: idStr,
  occurred_on: dateStr,
  kind: z.enum(C.INTERACTION_KIND_VALUES).default("message"),
  note: optText(2000),
});

// ---------------------------------------------------------------------------
// Knowledge

export const ENTITY_LINK_TYPES = ["goal", "project", "task", "subject", "journal", "note", "person", "skill"] as const;

export const noteSchema = z.object({
  title: reqText(200),
  body: optText(100000),
  folder: optText(80),
  pinned: bool.default(false),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30).optional(),
  links: z
    .array(z.object({ entity_type: z.enum(ENTITY_LINK_TYPES), entity_id: idStr }))
    .max(50)
    .optional(),
});

// ---------------------------------------------------------------------------
// Health, wellbeing & measures

export const checkinSchema = z.object({
  entry_date: dateStr,
  sleep_hours: optNum(0, 24),
  sleep_quality: scale5,
  mood: scale5,
  energy: scale5,
  stress: scale5,
  nutrition: scale5,
  steps: optInt(0, 200000),
  water_glasses: optInt(0, 50),
  screen_min: optInt(0, 1440),
  rest_day: bool.default(false),
  emotions: z.array(z.string().trim().max(30)).max(12).default([]),
  notes: optText(4000),
});

export const workoutSchema = z.object({
  occurred_on: dateStr,
  kind: z.enum(C.WORKOUT_KIND_VALUES).default("strength"),
  duration_min: intIn(1, 1440),
  intensity: z.enum(C.INTENSITY_VALUES).default("moderate"),
  notes: optText(2000),
});

export const metricSchema = z.object({
  name: reqText(80),
  unit: optText(30),
  life_area_id: optId,
  kind: z.enum(C.METRIC_KIND_VALUES).default("number"),
  direction: z.enum(C.METRIC_DIRECTION_VALUES).default("higher"),
  target: optNum(),
  active: bool.default(true),
});

export const metricEntrySchema = z.object({
  metric_id: idStr,
  entry_date: dateStr,
  value: numIn(-1e9, 1e9),
  note: optText(500),
});

export const environmentCheckSchema = z.object({
  area: z.enum(C.ENVIRONMENT_AREA_VALUES),
  checked_on: dateStr,
  rating: intIn(1, 5),
  note: optText(1000),
  change_idea: optText(500),
});

// ---------------------------------------------------------------------------
// Profile & settings (not a generic resource)

export const notificationPrefsSchema = z.object({
  enabled: bool.default(true),
  kinds: z.partialRecord(z.enum(C.NOTIFICATION_KIND_VALUES), bool).default({}),
  quiet_start: timeStr.default("22:00"),
  quiet_end: timeStr.default("07:00"),
  max_per_day: z.coerce.number().int().min(1).max(50).default(8),
  browser: bool.default(false),
});

export const profileSchema = z.object({
  display_name: optText(80),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
  week_start: z.coerce.number().int().min(0).max(1),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like INR"),
  units: z.enum(["metric", "imperial"]),
  theme: z.enum(["system", "light", "dark"]),
  accent: color,
  density: z.enum(["comfortable", "compact"]),
  reduced_motion: z.enum(["system", "reduce"]),
  day_start: timeStr,
  day_end: timeStr,
  default_focus_min: z.coerce.number().int().min(5).max(180),
  pomodoro_break_min: z.coerce.number().int().min(1).max(60),
  dashboard_widgets: z.array(z.enum(C.DASHBOARD_WIDGET_VALUES)).max(20),
  hidden_nav: z.array(z.string().max(40)).max(40),
  notification_prefs: notificationPrefsSchema,
  ai_enabled: bool,
  ai_include_journal: bool,
  habit_show_paused: bool,
  onboarded: bool,
});
export const profilePatchSchema = profileSchema.partial();

export const onboardingSchema = z.object({
  display_name: optText(80),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone").optional(),
  identity: optText(4000),
  ideal_life: optText(4000),
  current_reality: optText(4000),
  what_matters: optText(4000),
  constraints: optText(4000),
  values: z.array(reqText(60)).max(10).default([]),
  attention_areas: z.array(z.string().max(40)).max(10).default([]),
  goals: z
    .array(z.object({ title: reqText(200), area_key: z.string().max(40).nullable().optional(), why: optText(1000) }))
    .max(5)
    .default([]),
  habits: z.array(z.object({ title: reqText(120), minimum: optText(120) })).max(5).default([]),
  day_start: timeStr.default("07:00"),
  day_end: timeStr.default("22:00"),
  fixed_commitments: z
    .array(
      z.object({
        title: reqText(120),
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        start: timeStr,
        end: timeStr,
      }),
    )
    .max(10)
    .default([]),
  load_demo: bool.default(false),
});

export const authSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().min(1, "Required").max(200),
});

export type Profile = z.infer<typeof profileSchema>;
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
