import { addDays, weekStart } from "../dates";
import { check } from "./action";
import { getContext } from "./context";
import { ensureRecurring } from "./recurring";

type Row = Record<string, unknown>;

/** Realistic example data so the app makes sense on day one. Everything is flagged is_sample and removable. */
export async function loadSampleData(): Promise<{ loaded: boolean }> {
  const { supabase } = await getContext();
  try {
    return await insertSample();
  } catch (e) {
    // never leave half a sample behind
    await supabase.rpc("remove_sample_data");
    throw e;
  }
}

async function insertSample(): Promise<{ loaded: boolean }> {
  const { supabase, user, today } = await getContext();
  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("is_sample", true);
  if (count) return { loaded: false };
  // syllabus nodes have no flag of their own: they go away with their subject
  const S = (table: string, r: Row) => (table === "syllabus_nodes" ? r : { ...r, is_sample: true });
  const d = (n: number) => addDays(today, n);
  const ins = async (table: string, rows: Row[]) => check(await supabase.from(table).insert(rows.map((r) => S(table, r)), { defaultToNull: false }).select("id")) as { id: string }[];

  // college
  const [ds, maths] = await ins("subjects", [
    { name: "Data Structures", code: "CS201", color: "sky", weekly_target_min: 240 },
    { name: "Engineering Mathematics", code: "MA102", color: "violet", weekly_target_min: 180 },
  ]);
  const units = await ins("syllabus_nodes", [
    { subject_id: ds.id, kind: "unit", title: "Unit 1 · Arrays and linked lists", sort_order: 1 },
    { subject_id: ds.id, kind: "unit", title: "Unit 2 · Trees and graphs", sort_order: 2 },
  ]);
  const topics = await ins("syllabus_nodes", [
    { subject_id: ds.id, parent_id: units[0].id, kind: "topic", title: "Arrays and complexity", sort_order: 1, status: "done", done_on: d(-3), revision_count: 1, last_revised_on: d(-1), next_revision_on: d(2) },
    { subject_id: ds.id, parent_id: units[0].id, kind: "topic", title: "Linked lists", sort_order: 2, status: "done", done_on: d(-2), revision_count: 0, next_revision_on: d(-1) },
    { subject_id: ds.id, parent_id: units[0].id, kind: "topic", title: "Stacks and queues", sort_order: 3, status: "learning" },
    { subject_id: ds.id, parent_id: units[1].id, kind: "topic", title: "Binary trees and BSTs", sort_order: 1 },
    { subject_id: ds.id, parent_id: units[1].id, kind: "topic", title: "Graph traversal (BFS, DFS)", sort_order: 2 },
  ]);
  await ins("syllabus_nodes", [
    { subject_id: ds.id, parent_id: topics[1].id, kind: "subtopic", title: "Singly vs doubly linked lists", sort_order: 1, status: "done", done_on: d(-2), next_revision_on: d(-1) },
  ]);
  await ins("exams", [
    { subject_id: ds.id, title: "Data Structures mid-term", exam_date: d(18), exam_time: "10:00", weight_pct: 30, location: "Hall B" },
    { subject_id: maths.id, title: "Mathematics unit test", exam_date: d(11), exam_time: "14:00", weight_pct: 15 },
  ]);

  // basketball
  const drills = await ins("drills", [
    { name: "Stationary pound dribbles", skill: "ball_handling", default_minutes: 5, default_reps: 100 },
    { name: "Mikan drill, weak hand", skill: "finishing", default_minutes: 8, default_reps: 50 },
    { name: "Free throws", skill: "shooting", default_minutes: 15, default_reps: 50 },
    { name: "Spot-up threes", skill: "shooting", default_minutes: 20, default_reps: 60 },
    { name: "Pick-and-roll reads", skill: "decision_making", default_minutes: 20 },
    { name: "Closeouts and slides", skill: "defense", default_minutes: 10 },
    { name: "Ladder footwork", skill: "footwork", default_minutes: 8 },
  ]);
  await ins("practice_plans", [
    { name: "Guard skills", weekdays: [1, 3, 5], items: [{ drill_id: drills[0].id, name: "Stationary pound dribbles", minutes: 5, reps: 100 }, { drill_id: drills[1].id, name: "Mikan drill, weak hand", minutes: 8, reps: 50 }, { drill_id: drills[4].id, name: "Pick-and-roll reads", minutes: 20 }, { drill_id: drills[2].id, name: "Free throws", minutes: 15, reps: 50 }] },
    { name: "Shooting day", weekdays: [2, 6], items: [{ drill_id: drills[6].id, name: "Ladder footwork", minutes: 8 }, { drill_id: drills[3].id, name: "Spot-up threes", minutes: 20, reps: 60 }, { drill_id: drills[2].id, name: "Free throws", minutes: 15, reps: 50 }] },
  ]);

  // development
  await ins("roadmap_items", [
    { track: "web_basics", title: "Build a responsive landing page with CSS Grid", status: "done", done_on: d(-10), sort_order: 1 },
    { track: "web_basics", title: "Fetch and render API data with async/await", status: "doing", sort_order: 2 },
    { track: "react", title: "Hooks: useState, useEffect, custom hooks", status: "doing", sort_order: 1 },
    { track: "react", title: "Forms, validation and server actions", sort_order: 2 },
    { track: "backend", title: "Build a REST API with authentication", sort_order: 1 },
    { track: "databases_auth", title: "Model a relational schema with row-level security", sort_order: 1 },
    { track: "git_github", title: "Feature branches, pull requests and code review", status: "done", done_on: d(-6), sort_order: 1 },
    { track: "deployment", title: "Deploy a Next.js app and set environment variables", sort_order: 1 },
    { track: "quality", title: "Write unit tests for core business logic", sort_order: 1 },
    { track: "ai_automation", title: "Call an LLM API from a server route safely", sort_order: 1 },
    { track: "portfolio", title: "Ship three polished projects with live demos", sort_order: 1 },
    { track: "freelancing", title: "Write a reusable proposal template", sort_order: 1 },
  ]);
  const [proj] = await ins("projects", [
    { name: "Portfolio website", description: "Personal site with case studies.", stage: "building", skills: ["Next.js", "Tailwind"], features_total: 6, features_done: 2, started_on: d(-12) },
  ]);
  await ins("freelance_leads", [
    { name: "Local gym website refresh", company: "Iron House Gym", channel: "Instagram DM", status: "contacted", expected_value: 25000, currency: "INR", next_followup_on: d(2) },
  ]);

  // health
  await ins("workout_routines", [
    { name: "Upper body", weekdays: [1, 4], exercises: [{ name: "Bench press", sets: 4, reps: 8 }, { name: "Barbell row", sets: 4, reps: 8 }, { name: "Overhead press", sets: 3, reps: 10 }] },
    { name: "Lower body", weekdays: [2, 5], exercises: [{ name: "Squat", sets: 4, reps: 6 }, { name: "Romanian deadlift", sets: 3, reps: 8 }, { name: "Walking lunges", sets: 3, reps: 10 }] },
  ]);

  // quests
  const weekEnd = addDays(weekStart(today), 6);
  const [boss] = await ins("tasks", [
    { title: "Finish the Data Structures revision plan", category: "college", difficulty: "boss", quest_type: "boss", est_minutes: null, scheduled_date: null, due_date: d(16), subject_id: ds.id, priority: 1 },
  ]);
  await ins("tasks", [
    { title: "Revise yesterday's material (20 min)", category: "college", difficulty: "easy", est_minutes: 20, scheduled_date: d(-1) },
    { title: "100 stationary dribble reps", category: "basketball", difficulty: "easy", est_minutes: 10, scheduled_date: today, subcategory: "ball_handling" },
    { title: "Study linked lists for 45 minutes", category: "college", difficulty: "medium", est_minutes: 45, scheduled_date: today, subject_id: ds.id, priority: 1 },
    { title: "Learn and implement one React concept", category: "dev", difficulty: "medium", est_minutes: 30, scheduled_date: today, project_id: proj.id },
    { title: "Complete today's planned workout", category: "health", difficulty: "hard", est_minutes: 45, scheduled_date: today },
    { title: "Hit my protein target", category: "health", difficulty: "medium", scheduled_date: today, verify: { kind: "protein" } },
    { title: "50 weak-hand finishes", category: "basketball", difficulty: "medium", est_minutes: 20, scheduled_date: d(1), subcategory: "finishing" },
    { title: "Solve 15 practice questions", category: "college", difficulty: "medium", est_minutes: 30, scheduled_date: d(1), subject_id: ds.id },
    { title: "Build one working API endpoint", category: "dev", difficulty: "medium", est_minutes: 60, scheduled_date: d(2), project_id: proj.id },
    { title: "Follow up with Iron House Gym", category: "dev", difficulty: "easy", est_minutes: 15, scheduled_date: d(2) },
    { title: "Complete 4 workouts this week", category: "health", difficulty: "hard", quest_type: "weekly", est_minutes: null, scheduled_date: null, due_date: weekEnd },
    { title: "Improve my portfolio (30 min)", category: "dev", difficulty: "easy", est_minutes: 30, scheduled_date: null },
    { title: "Reach a 70% free-throw session", category: "basketball", difficulty: "hard", quest_type: "challenge", est_minutes: null, scheduled_date: null, due_date: d(30) },
  ]);
  await ins("tasks", [
    { title: "Make a flashcard set for lists and queues", parent_id: boss.id, category: "college", difficulty: "easy", est_minutes: 30, scheduled_date: null, subject_id: ds.id },
    { title: "Do a timed practice test on Unit 1", parent_id: boss.id, category: "college", difficulty: "medium", est_minutes: 60, scheduled_date: null, subject_id: ds.id },
    { title: "Review mistakes from the practice test", parent_id: boss.id, category: "college", difficulty: "medium", est_minutes: 40, scheduled_date: null, subject_id: ds.id },
  ]);
  await ins("tasks", [
    { title: "10 minutes of mobility", category: "health", difficulty: "easy", est_minutes: 10, quest_type: "recovery", status: "template", verify: { kind: "mobility" }, recurrence: { freq: "daily", interval: 1, start: today, until: null } },
    { title: "Log bodyweight", category: "health", difficulty: "easy", est_minutes: 2, quest_type: "habit", status: "template", verify: { kind: "bodyweight" }, recurrence: { freq: "weekly", interval: 1, weekdays: [1], start: today, until: null } },
  ]);

  await ins("rewards", [
    { title: "New basketball shoes", note: "Earned, not bought on impulse.", unlock_kind: "level", unlock_value: 5 },
    { title: "Movie night with friends", unlock_kind: "streak", unlock_value: 7 },
    { title: "Weekend off-screen trip", unlock_kind: "achievement", unlock_key: "boss_1" },
  ]);

  await ensureRecurring(supabase, today);
  void user;
  return { loaded: true };
}
