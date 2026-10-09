import type { ZodType } from "zod";
import * as s from "./schemas";

// Generic CRUD for simple user-owned tables. Only tables listed here can be written through the generic actions,
// every payload is validated by its schema, and user_id is never taken from the client.

export type ResourceName =
  | "subjects" | "syllabus_nodes" | "exams" | "projects" | "roadmap_items" | "freelance_leads" | "outreach_log" | "income_records"
  | "drills" | "practice_plans" | "bball_metrics" | "workout_routines" | "nutrition_entries" | "body_metrics" | "rewards";

type Def = { table: string; schema: ZodType; paths: string[]; upsert?: string };

export const RESOURCES: Record<ResourceName, Def> = {
  subjects: { table: "subjects", schema: s.subjectSchema, paths: ["/college", "/"] },
  syllabus_nodes: { table: "syllabus_nodes", schema: s.syllabusNodeSchema, paths: ["/college"] },
  exams: { table: "exams", schema: s.examSchema, paths: ["/college", "/calendar", "/"] },
  projects: { table: "projects", schema: s.projectSchema, paths: ["/dev"] },
  roadmap_items: { table: "roadmap_items", schema: s.roadmapItemSchema, paths: ["/dev"] },
  freelance_leads: { table: "freelance_leads", schema: s.leadSchema, paths: ["/dev"] },
  outreach_log: { table: "outreach_log", schema: s.outreachSchema, paths: ["/dev"] },
  income_records: { table: "income_records", schema: s.incomeSchema, paths: ["/dev", "/stats"] },
  drills: { table: "drills", schema: s.drillSchema, paths: ["/basketball"] },
  practice_plans: { table: "practice_plans", schema: s.practicePlanSchema, paths: ["/basketball"] },
  bball_metrics: { table: "bball_metrics", schema: s.metricSchema, paths: ["/basketball"] },
  workout_routines: { table: "workout_routines", schema: s.routineSchema, paths: ["/health"] },
  nutrition_entries: { table: "nutrition_entries", schema: s.nutritionSchema, paths: ["/health", "/quests", "/"] },
  body_metrics: { table: "body_metrics", schema: s.bodyMetricSchema, paths: ["/health"], upsert: "user_id,logged_on,kind" },
  rewards: { table: "rewards", schema: s.rewardSchema, paths: ["/achievements"] },
};

export const isResource = (x: string): x is ResourceName => Object.hasOwn(RESOURCES, x);
