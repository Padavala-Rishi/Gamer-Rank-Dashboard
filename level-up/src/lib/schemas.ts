import { z } from "zod";
import { isYMD } from "./dates";
import { CURRENCIES, DIFFICULTIES, LEAD_STATUSES, PROJECT_STAGES, QUEST_TYPES, SKILLS, TRACKS } from "./constants";

// Server-side validation. Forms are convenience; these schemas are the rule.

const blank = (v: unknown) => (v === "" || v === undefined ? null : v);
const toNum = (v: unknown) => (v === "" || v === undefined || v === null ? null : typeof v === "number" ? v : Number(v));

export const text = (max: number, label = "This field") => z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `Keep it under ${max} characters`);
export const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Keep it under ${max} characters`).nullable());
export const int = (min: number, max: number, label = "Value") =>
  z.preprocess(toNum, z.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`));
export const optInt = (min: number, max: number, label = "Value") =>
  z.preprocess(toNum, z.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`).nullable());
export const num = (min: number, max: number, label = "Value") =>
  z.preprocess(toNum, z.number({ error: `${label} must be a number` }).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`));
export const optNum = (min: number, max: number, label = "Value") =>
  z.preprocess(toNum, z.number({ error: `${label} must be a number` }).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`).nullable());
export const ymd = z.string({ error: "Pick a date" }).refine(isYMD, "Pick a valid date");
export const optYmd = z.preprocess(blank, ymd.nullable());
export const optTime = z.preprocess(blank, z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM").nullable());
export const uuid = z.string().uuid();
export const optUuid = z.preprocess(blank, z.string().uuid().nullable());
export const weekdays = z.array(z.number().int().min(1).max(7)).max(7).default([]);
export const optUrl = z.preprocess(blank, z.string().trim().max(300).refine((u) => /^https?:\/\//i.test(u), "Must start with http:// or https://").nullable());
export const currency = z.enum(CURRENCIES as unknown as [string, ...string[]], { error: "Pick a currency" });

// ── resources ──

export const subjectSchema = z.object({
  name: text(80, "Name"), code: optText(20), color: z.string().max(20).default("slate"),
  weekly_target_min: int(0, 3000, "Weekly target").default(180), archived: z.boolean().optional(),
});
export const syllabusNodeSchema = z.object({
  subject_id: uuid, parent_id: optUuid, kind: z.enum(["unit", "topic", "subtopic"]).default("topic"),
  title: text(160, "Title"), notes: optText(2000), sort_order: z.coerce.number().optional(),
});
export const examSchema = z.object({
  subject_id: optUuid, title: text(120, "Title"), exam_date: ymd, exam_time: optTime, location: optText(120),
  weight_pct: optNum(0, 100, "Weight"), status: z.enum(["upcoming", "taken"]).default("upcoming"), score_pct: optNum(0, 100, "Score"), notes: optText(2000),
});
export const projectSchema = z.object({
  name: text(100, "Name"), description: optText(2000), stage: z.enum(PROJECT_STAGES).default("planned"),
  repo_url: optUrl, live_url: optUrl, skills: z.preprocess((v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v), z.array(z.string().max(30)).max(30)).default([]),
  is_client_work: z.boolean().default(false), features_total: int(0, 500, "Total features").default(0), features_done: int(0, 500, "Done features").default(0),
  started_on: optYmd, deployed_on: optYmd, completed_on: optYmd,
}).refine((p) => p.features_done <= p.features_total, { message: "Done features can't exceed the total", path: ["features_done"] });
export const roadmapItemSchema = z.object({
  track: z.enum(TRACKS.map((t) => t.key) as [string, ...string[]], { error: "Pick a track" }), title: text(160, "Title"),
  status: z.enum(["todo", "doing", "done"]).default("todo"), resource_url: optUrl, notes: optText(2000),
});
export const leadSchema = z.object({
  name: text(120, "Name"), company: optText(120), channel: optText(40), contact: optText(200),
  status: z.enum(LEAD_STATUSES).default("identified"), expected_value: optNum(0, 1e9, "Value"), currency: currency.default("INR"),
  next_followup_on: optYmd, lost_reason: optText(300), notes: optText(2000),
});
export const outreachSchema = z.object({
  lead_id: uuid, kind: z.enum(["message", "followup", "proposal", "reply", "meeting", "note"]), occurred_on: ymd, summary: optText(500),
});
export const incomeSchema = z.object({
  kind: z.enum(["invoice", "payment"]), amount: num(0.01, 1e9, "Amount"), currency: currency.default("INR"), occurred_on: ymd, due_on: optYmd,
  invoice_id: optUuid, lead_id: optUuid, project_id: optUuid, client: optText(120), note: optText(500),
});
export const drillSchema = z.object({
  name: text(100, "Name"), skill: z.enum(SKILLS).default("ball_handling"), default_minutes: optInt(1, 240, "Minutes"), default_reps: optInt(1, 2000, "Reps"),
  notes: optText(1000), archived: z.boolean().optional(),
});
export const planItemSchema = z.object({ drill_id: optUuid.optional(), name: text(100, "Drill"), minutes: optInt(1, 240).optional(), reps: optInt(1, 2000).optional() });
export const practicePlanSchema = z.object({ name: text(100, "Name"), weekdays, items: z.array(planItemSchema).max(30).default([]), notes: optText(1000) });
export const metricSchema = z.object({
  name: text(60, "Name"), kind: z.enum(["shooting", "value"]).default("shooting"), unit: optText(20), direction: z.enum(["higher", "lower"]).default("higher"),
});
export const routineSchema = z.object({
  name: text(100, "Name"), weekdays,
  exercises: z.array(z.object({ name: text(80, "Exercise"), sets: optInt(1, 50).optional(), reps: optInt(1, 500).optional(), weight_kg: optNum(0, 1000).optional() })).max(40).default([]),
  notes: optText(1000),
});
export const nutritionSchema = z.object({ logged_on: ymd, label: z.string().trim().max(80).default("Meal"), protein_g: num(0, 500, "Protein").default(0), calories: optInt(0, 10000, "Calories") });
export const bodyMetricSchema = z.object({ logged_on: ymd, kind: text(40, "Measurement"), value: num(0.1, 999, "Value"), unit: z.string().trim().max(10).default("kg") });
export const rewardSchema = z.object({
  title: text(100, "Reward"), note: optText(300),
  unlock_kind: z.enum(["level", "category_level", "streak", "achievement", "xp"]),
  unlock_category: z.preprocess(blank, z.enum(["basketball", "college", "dev", "health"]).nullable()),
  unlock_key: z.preprocess(blank, z.string().max(40).nullable()),
  unlock_value: optNum(1, 1e7, "Target"),
}).superRefine((r, ctx) => {
  if (r.unlock_kind === "achievement" && !r.unlock_key) ctx.addIssue({ code: "custom", path: ["unlock_key"], message: "Pick an achievement" });
  if (r.unlock_kind === "category_level" && !r.unlock_category) ctx.addIssue({ code: "custom", path: ["unlock_category"], message: "Pick an area" });
  if (r.unlock_kind !== "achievement" && r.unlock_value == null) ctx.addIssue({ code: "custom", path: ["unlock_value"], message: "Enter a target" });
});

// ── quests ──

export const recurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]), interval: int(1, 12, "Interval").default(1),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(), monthday: optInt(1, 31).optional(),
  start: ymd, until: optYmd.optional(),
});

export const verifySchema = z.object({
  kind: z.enum(["protein", "water", "sleep", "mobility", "bodyweight", "workout", "rest", "practice", "focus", "shooting"]),
  minutes: optInt(1, 600).optional(), category: z.enum(["college", "dev", "basketball", "health"]).optional(), attempts: optInt(1, 5000).optional(),
});

export const taskSchema = z.object({
  title: text(160, "Title"), description: optText(2000), notes: optText(4000),
  category: z.enum(["basketball", "college", "dev", "health", "life"]).default("life"), subcategory: optText(40),
  difficulty: z.enum(DIFFICULTIES).default("easy"), quest_type: z.enum(QUEST_TYPES).default("daily"),
  priority: int(1, 3, "Priority").default(2), est_minutes: optInt(1, 1440, "Estimate"),
  scheduled_date: optYmd, scheduled_time: optTime, due_date: optYmd,
  subject_id: optUuid, project_id: optUuid, parent_id: optUuid,
  verify: verifySchema.nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
});
export type TaskInput = z.infer<typeof taskSchema>;

// ── profile & settings ──

export const profileSchema = z.object({
  character_name: text(40, "Name"),
  avatar: z.object({ icon: z.string().max(20), tone: z.string().max(20) }),
  timezone: z.string().min(1).max(64),
});

const availability = z.object(Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, int(0, 1440, "Minutes")])) as Record<string, ReturnType<typeof int>>);
export const commitmentSchema = z.object({ title: text(60, "Title"), days: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one day").max(7), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })
  .refine((c) => c.start < c.end, { message: "End must be after start", path: ["end"] });
export const targetsSchema = z.object({
  protein_g: num(0, 500, "Protein"), water_ml: int(0, 15000, "Water"), sleep_min_h: num(3, 12, "Min sleep"), sleep_max_h: num(4, 14, "Max sleep"),
  mobility_min: int(0, 240, "Mobility"), calories: optInt(0, 10000, "Calories"), study_weekly_min: int(0, 6000, "Study target"),
  coding_weekly_min: int(0, 6000, "Coding target"), practice_weekly: int(0, 14, "Practice days"), workouts_weekly: int(0, 14, "Workout days"), income_monthly: num(0, 1e9, "Income target"),
}).refine((t) => t.sleep_min_h < t.sleep_max_h, { message: "Min sleep must be lower than max", path: ["sleep_max_h"] });

export const settingsPatchSchema = z.object({
  theme: z.enum(["dark", "light"]),
  xp_preference: z.enum(["relaxed", "standard", "hardcore"]),
  level_base: num(20, 1000, "Level base"), level_exponent: num(1.1, 2.5, "Level exponent"), category_level_base: num(10, 1000, "Attribute base"),
  xp_values: z.object({ easy: int(1, 500), medium: int(1, 500), hard: int(1, 500), boss: int(1, 500) })
    .refine((v) => v.easy <= v.medium && v.medium <= v.hard && v.hard <= v.boss, { message: "XP must not decrease from Easy to Boss Quest" }),
  daily_task_limit: int(1, 30, "Daily limit"), availability, commitments: z.array(commitmentSchema).max(30),
  rest_weekdays: z.array(z.number().int().min(1).max(7)).max(6, "Keep at least one training day"),
  mvd_minutes: int(15, 240, "Minimum day"), currency, targets: targetsSchema,
  goals: z.record(z.string(), z.object({ goal: optText(200).optional(), level: z.string().max(20).optional(), days: z.array(z.number().int().min(1).max(7)).max(7).optional() })),
  pomodoro: z.object({ focus: int(5, 120), short: int(1, 60), long: int(5, 90), cycles: int(2, 8) }),
  ai_consent: z.boolean(), week_starts_on: z.union([z.literal(0), z.literal(1)]),
}).partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const healthDaySchema = z.object({
  day: ymd, water_ml: int(0, 15000, "Water").optional(), sleep_hours: optNum(0, 24, "Sleep").optional(), sleep_quality: optInt(1, 5).optional(),
  mobility_min: int(0, 600, "Mobility").optional(), is_rest_day: z.boolean().optional(), notes: optText(500).optional(),
});

export const focusSessionSchema = z.object({
  category: z.enum(["college", "dev", "basketball", "health", "life"]), session_date: ymd, minutes: int(1, 720, "Minutes"),
  planned_minutes: optInt(1, 720), mode: z.enum(["pomodoro", "free"]).default("free"),
  task_id: optUuid, subject_id: optUuid, project_id: optUuid, track: optText(40), note: optText(300),
});

export const practiceSessionSchema = z.object({
  session_date: ymd, title: text(100, "Title").default("Practice"), plan_id: optUuid, duration_min: optInt(1, 600, "Duration"), intensity: optInt(1, 10, "Intensity"), notes: optText(2000),
  status: z.enum(["planned", "done"]).default("done"),
  drills: z.array(z.object({ drill_id: optUuid.optional(), name: text(100, "Drill"), planned_reps: optInt(1, 2000).optional(), done_reps: optInt(0, 5000).optional(), minutes: optInt(1, 240).optional(), completed: z.boolean().default(false), notes: optText(500).optional() })).max(30).default([]),
});

export const performanceLogSchema = z.object({
  metric_id: uuid, logged_on: ymd, attempts: optInt(1, 5000, "Attempts"), makes: optInt(0, 5000, "Makes"), value: optNum(-100000, 100000, "Value"), session_id: optUuid, notes: optText(300),
}).superRefine((l, ctx) => {
  if (l.attempts == null && l.value == null) ctx.addIssue({ code: "custom", path: ["attempts"], message: "Enter attempts, or a value" });
  if (l.makes != null && l.attempts == null) ctx.addIssue({ code: "custom", path: ["attempts"], message: "Enter attempts too" });
  if (l.makes != null && l.attempts != null && l.makes > l.attempts) ctx.addIssue({ code: "custom", path: ["makes"], message: "Makes can't exceed attempts" });
});

export const workoutSchema = z.object({
  workout_date: ymd, name: text(100, "Name").default("Workout"), routine_id: optUuid, duration_min: optInt(1, 360, "Duration"), intensity: optInt(1, 10, "Intensity"), notes: optText(2000),
  sets: z.array(z.object({ exercise: text(80, "Exercise"), set_no: int(1, 50).default(1), reps: int(0, 500, "Reps"), weight_kg: num(0, 1000, "Weight") })).max(200).default([]),
});
