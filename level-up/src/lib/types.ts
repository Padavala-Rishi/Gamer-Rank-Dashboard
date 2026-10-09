import type { AnyCategory, Difficulty, LeadStatus, ProjectStage, QuestType, Skill, TaskStatus, TrackKey } from "./constants";
import type { YMD } from "./dates";
import type { Recurrence } from "./game/recurrence";

// Row shapes as returned by PostgREST (numeric columns can arrive as strings).

export type Avatar = { icon: string; tone: string };

export type Profile = {
  id: string;
  character_name: string;
  avatar: Avatar;
  active_title: string | null;
  timezone: string;
  onboarded_at: string | null;
};

export type Targets = {
  protein_g: number; water_ml: number; sleep_min_h: number; sleep_max_h: number; mobility_min: number; calories: number | null;
  study_weekly_min: number; coding_weekly_min: number; practice_weekly: number; workouts_weekly: number; income_monthly: number;
};

export type Commitment = { title: string; days: number[]; start: string; end: string };

export type Settings = {
  user_id: string;
  theme: "dark" | "light";
  level_base: number | string;
  level_exponent: number | string;
  category_level_base: number | string;
  xp_preference: "relaxed" | "standard" | "hardcore";
  xp_values: Record<Difficulty, number>;
  daily_task_limit: number;
  availability: Record<string, number>;
  commitments: Commitment[];
  rest_weekdays: number[];
  mvd_minutes: number;
  currency: string;
  targets: Targets;
  goals: Partial<Record<AnyCategory, { goal?: string | null; level?: string; days?: number[] }>>;
  pomodoro: { focus: number; short: number; long: number; cycles: number };
  ai_consent: boolean;
  week_starts_on: 0 | 1;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  category: AnyCategory;
  subcategory: string | null;
  difficulty: Difficulty;
  quest_type: QuestType;
  priority: number;
  est_minutes: number | null;
  actual_minutes: number | null;
  scheduled_date: YMD | null;
  scheduled_time: string | null;
  due_date: YMD | null;
  status: TaskStatus;
  sort_order: number;
  recurrence: Recurrence | null;
  template_id: string | null;
  parent_id: string | null;
  verify: { kind: string; [k: string]: unknown } | null;
  subject_id: string | null;
  project_id: string | null;
  is_sample: boolean;
};

export type Completion = { id: string; task_id: string; completed_on: YMD; completed_at: string; category: AnyCategory; xp_awarded: number; status: string; occurrence_date: YMD | null };
export type ActivityEvent = { id: string; kind: "quest_done" | "level_up" | "achievement" | "reward"; category: AnyCategory | null; title: string; detail: Record<string, unknown>; created_at: string };
export type AchievementDef = { key: string; name: string; description: string; category: AnyCategory | null; icon: string; metric: string; threshold: number; title: string | null; tier: number; sort: number };

export type Subject = { id: string; name: string; code: string | null; color: string; weekly_target_min: number; archived: boolean; is_sample: boolean };
export type SyllabusNodeRow = { id: string; subject_id: string; parent_id: string | null; kind: "unit" | "topic" | "subtopic"; title: string; sort_order: number; status: "todo" | "learning" | "done"; done_on: YMD | null; revision_count: number; last_revised_on: YMD | null; next_revision_on: YMD | null; notes: string | null };
export type Exam = { id: string; subject_id: string | null; title: string; exam_date: YMD; exam_time: string | null; location: string | null; weight_pct: number | null; status: "upcoming" | "taken"; score_pct: number | null; notes: string | null; is_sample: boolean };
export type FocusSession = { id: string; category: AnyCategory; session_date: YMD; started_at: string; minutes: number; planned_minutes: number | null; mode: "pomodoro" | "free"; task_id: string | null; subject_id: string | null; project_id: string | null; track: string | null; note: string | null };

export type Drill = { id: string; name: string; skill: Skill; default_minutes: number | null; default_reps: number | null; notes: string | null; archived: boolean; is_sample: boolean };
export type PlanItem = { drill_id?: string | null; name: string; minutes?: number | null; reps?: number | null };
export type PracticePlan = { id: string; name: string; weekdays: number[]; items: PlanItem[]; notes: string | null; is_sample: boolean };
export type PracticeSession = { id: string; session_date: YMD; plan_id: string | null; title: string; status: "planned" | "done"; duration_min: number | null; intensity: number | null; notes: string | null };
export type PracticeDrill = { id: string; session_id: string; drill_id: string | null; name: string; planned_reps: number | null; done_reps: number | null; minutes: number | null; completed: boolean; notes: string | null; sort_order: number };
export type BballMetric = { id: string; name: string; kind: "shooting" | "value"; unit: string | null; direction: "higher" | "lower" };
export type PerformanceLog = { id: string; metric_id: string; logged_on: YMD; session_id: string | null; attempts: number | null; makes: number | null; value: number | null; notes: string | null };

export type RoutineExercise = { name: string; sets?: number | null; reps?: number | null; weight_kg?: number | null };
export type WorkoutRoutine = { id: string; name: string; weekdays: number[]; exercises: RoutineExercise[]; notes: string | null; is_sample: boolean };
export type Workout = { id: string; workout_date: YMD; routine_id: string | null; name: string; duration_min: number | null; intensity: number | null; notes: string | null };
export type WorkoutSet = { id: string; workout_id: string; exercise: string; set_no: number; reps: number; weight_kg: number | string };
export type BodyMetric = { id: string; logged_on: YMD; kind: string; value: number | string; unit: string };
export type HealthDay = { day: YMD; water_ml: number; sleep_hours: number | string | null; sleep_quality: number | null; mobility_min: number; is_rest_day: boolean; notes: string | null };
export type NutritionEntry = { id: string; logged_on: YMD; label: string; protein_g: number | string; calories: number | null };

export type RoadmapItemRow = { id: string; track: TrackKey; title: string; status: "todo" | "doing" | "done"; done_on: YMD | null; resource_url: string | null; notes: string | null; sort_order: number; is_sample: boolean };
export type Project = { id: string; name: string; description: string | null; stage: ProjectStage; repo_url: string | null; live_url: string | null; skills: string[]; is_client_work: boolean; features_total: number; features_done: number; started_on: YMD | null; deployed_on: YMD | null; completed_on: YMD | null; is_sample: boolean };
export type Lead = { id: string; name: string; company: string | null; channel: string | null; contact: string | null; status: LeadStatus; expected_value: number | string | null; currency: string; next_followup_on: YMD | null; lost_reason: string | null; notes: string | null; status_changed_at: string; is_sample: boolean };
export type OutreachEntry = { id: string; lead_id: string; kind: "message" | "followup" | "proposal" | "reply" | "meeting" | "note"; occurred_on: YMD; summary: string | null };
export type IncomeRecord = { id: string; kind: "invoice" | "payment"; amount: number | string; currency: string; occurred_on: YMD; due_on: YMD | null; invoice_id: string | null; lead_id: string | null; project_id: string | null; client: string | null; note: string | null };

export type Reward = { id: string; title: string; note: string | null; unlock_kind: "level" | "category_level" | "streak" | "achievement" | "xp"; unlock_category: AnyCategory | null; unlock_key: string | null; unlock_value: number | string | null; claimed_at: string | null; is_sample: boolean };
export type DayPlan = { day: YMD; mvd: boolean; intention: string | null; review: { wins?: string; friction?: string; tomorrow?: string } | null; reviewed_at: string | null };

export type CompleteResult = {
  already_done: boolean;
  xp: number;
  base?: number;
  bonus?: number;
  category?: AnyCategory;
  total_xp?: number;
  level_before?: number;
  level_after?: number;
  category_level_before?: number;
  category_level_after?: number;
  level_ups: { scope: string; level: number }[];
  achievements: { key: string; name: string; icon: string; title: string | null; description: string }[];
};

export type ProgressSummary = {
  xp_by_category: Partial<Record<AnyCategory, number>>;
  current_streak: number;
  best_streak: number;
  metrics: Record<string, number>;
};
