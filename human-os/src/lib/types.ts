// Client-side row types derived from the shared validation schemas.
import type { z } from "zod";
import type * as S from "../../shared/schemas";
import type { HabitStats } from "../../shared/habits";
import type { Occurrence } from "../../shared/calendar";
import type { Recommendation, ScoredTask, PlanSuggestion } from "../../shared/planner";

interface Base {
  id: string;
  created_at: string;
  updated_at: string;
  is_demo: boolean;
}
type Out<T extends z.ZodTypeAny> = z.output<T>;

export type LifeArea = Base & Out<typeof S.lifeAreaSchema>;
export type Value = Base & Out<typeof S.valueSchema>;
export type Vision = Partial<Out<typeof S.visionSchema>>;
export type Goal = Base & Out<typeof S.goalSchema> & { value_ids: string[]; achieved_at: string | null };
export type GoalView = Goal & {
  progress: number | null;
  pace: string;
  expected: number | null;
  milestones_done: number;
  milestones_total: number;
  tasks_done: number;
  tasks_total: number;
  habit_count: number;
  project_count: number;
  child_ids: string[];
  smart: { key: string; label: string; ok: boolean | null; hint: string }[];
  days_left: number | null;
  last_activity: string | null;
};
export type Milestone = Base & Out<typeof S.milestoneSchema>;
export type Project = Base & Out<typeof S.projectSchema> & { completed_at: string | null; task_total: number; task_done: number; remaining_min: number; actual_min: number };
export type Task = Base &
  Out<typeof S.taskSchema> & { depends_on: string[]; completed_at: string | null; blocked: boolean; subtask_total: number; subtask_done: number };
export type Habit = Base & Out<typeof S.habitSchema>;
export type HabitView = Habit & { stats: HabitStats; logs: { id: string; date: string; status: string; value: number | null }[] };
export type HabitLog = Base & Out<typeof S.habitLogSchema>;
export type CalEvent = Base & Out<typeof S.eventSchema>;
export type EventOccurrence = CalEvent & Occurrence;
export type FocusSession = Base & Out<typeof S.focusSessionSchema> & { local_date: string };
export type Distraction = Base & Out<typeof S.distractionSchema> & { local_date: string; local_hour: number };
export type JournalEntry = Base & Out<typeof S.journalSchema>;
export type Decision = Base & Out<typeof S.decisionSchema>;
export type DecisionReview = Base & Out<typeof S.decisionReviewSchema>;
export type Review = Base & Out<typeof S.reviewSchema> & { completed_at: string | null };
export type Subject = Base & Out<typeof S.subjectSchema>;
export type Topic = Base & Out<typeof S.topicSchema> & { last_studied: string | null };
export type LearningResource = Base & Out<typeof S.resourceSchema>;
export type Flashcard = Base & Out<typeof S.flashcardSchema> & { due_date: string; ease: number; interval_days: number; repetitions: number; lapses: number; last_reviewed: string | null };
export type Assessment = Base & Out<typeof S.assessmentSchema>;
export type Skill = Base & Out<typeof S.skillSchema> & { prerequisite_ids: string[] };
export type SkillEvidence = Base & Out<typeof S.skillEvidenceSchema>;
export type Application = Base & Out<typeof S.applicationSchema>;
export type Account = Base & Out<typeof S.accountSchema>;
export type Transaction = Base & Out<typeof S.transactionSchema>;
export type Budget = Base & Out<typeof S.budgetSchema>;
export type Subscription = Base & Out<typeof S.subscriptionSchema>;
export type FinancialGoal = Base & Out<typeof S.financialGoalSchema>;
export type Person = Base & Out<typeof S.personSchema> & { last_interaction: string | null };
export type Interaction = Base & Out<typeof S.interactionSchema>;
export type Note = Base & Out<typeof S.noteSchema> & { tags: string[]; links: { entity_type: string; entity_id: string }[] };
export type Checkin = Base & Out<typeof S.checkinSchema>;
export type Workout = Base & Out<typeof S.workoutSchema>;
export type Metric = Base & Out<typeof S.metricSchema>;
export type MetricEntry = Base & Out<typeof S.metricEntrySchema>;
export type EnvironmentCheck = Base & Out<typeof S.environmentCheckSchema>;
export type Profile = S.Profile;

export type { Recommendation, ScoredTask, PlanSuggestion, HabitStats };

export interface User {
  id: string;
  email: string;
  created_at?: string;
}
