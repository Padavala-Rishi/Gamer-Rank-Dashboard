import type { AnyCategory, Difficulty, QuestType } from "./constants";

export type Verify = { kind: string; minutes?: number; category?: string; attempts?: number } | null;
export type QuestPreset = { title: string; category: AnyCategory; difficulty: Difficulty; est_minutes: number | null; quest_type?: QuestType; subcategory?: string; verify?: Verify; note?: string };

// One-tap starting points. Tweak them freely — nothing here assumes every drill suits every day.
export const PRESETS: Record<AnyCategory, QuestPreset[]> = {
  basketball: [
    { title: "100 stationary dribble reps", category: "basketball", difficulty: "easy", est_minutes: 10, subcategory: "ball_handling" },
    { title: "50 weak-hand finishes", category: "basketball", difficulty: "medium", est_minutes: 20, subcategory: "finishing" },
    { title: "50 free throws (record makes)", category: "basketball", difficulty: "medium", est_minutes: 20, subcategory: "shooting", verify: { kind: "shooting", attempts: 50 }, note: "Needs 50 shot attempts logged in Basketball → Log" },
    { title: "30 minutes of shooting practice", category: "basketball", difficulty: "medium", est_minutes: 30, subcategory: "shooting" },
    { title: "Pick-and-roll reads (20 min)", category: "basketball", difficulty: "medium", est_minutes: 20, subcategory: "decision_making" },
    { title: "Defensive slides and closeouts (15 min)", category: "basketball", difficulty: "easy", est_minutes: 15, subcategory: "defense" },
    { title: "Complete today's planned training session", category: "basketball", difficulty: "hard", est_minutes: 60, verify: { kind: "practice" }, note: "Needs a finished practice session logged" },
  ],
  college: [
    { title: "Study one topic for 45 minutes", category: "college", difficulty: "medium", est_minutes: 45, verify: { kind: "focus", category: "college", minutes: 45 }, note: "Needs 45 focused minutes logged (use the timer)" },
    { title: "Solve 15 practice questions", category: "college", difficulty: "medium", est_minutes: 30 },
    { title: "Revise yesterday's material (20 min)", category: "college", difficulty: "easy", est_minutes: 20 },
    { title: "Complete one syllabus subtopic", category: "college", difficulty: "medium", est_minutes: 45 },
    { title: "Take a timed practice test", category: "college", difficulty: "hard", est_minutes: 90 },
    { title: "Finish an assignment before its deadline", category: "college", difficulty: "hard", est_minutes: 120 },
    { title: "Finish the exam revision plan", category: "college", difficulty: "boss", est_minutes: null, quest_type: "boss" },
  ],
  dev: [
    { title: "Learn and implement one React concept", category: "dev", difficulty: "medium", est_minutes: 45, verify: { kind: "focus", category: "dev", minutes: 30 }, note: "Needs 30 focused minutes logged" },
    { title: "Build one working API endpoint", category: "dev", difficulty: "medium", est_minutes: 60 },
    { title: "Fix a bug and document the solution", category: "dev", difficulty: "medium", est_minutes: 45 },
    { title: "Push meaningful code to GitHub", category: "dev", difficulty: "easy", est_minutes: 20 },
    { title: "Complete a project feature", category: "dev", difficulty: "hard", est_minutes: 90 },
    { title: "Deploy a project", category: "dev", difficulty: "hard", est_minutes: 90 },
    { title: "Improve my portfolio (30 min)", category: "dev", difficulty: "easy", est_minutes: 30 },
    { title: "Send a personalised proposal to a potential client", category: "dev", difficulty: "medium", est_minutes: 30 },
    { title: "Follow up with a previous lead", category: "dev", difficulty: "easy", est_minutes: 15 },
  ],
  health: [
    { title: "Complete today's planned workout", category: "health", difficulty: "hard", est_minutes: 60, verify: { kind: "workout" }, note: "Needs a workout logged today" },
    { title: "Hit my protein target", category: "health", difficulty: "medium", est_minutes: null, verify: { kind: "protein" }, note: "Needs your protein target logged" },
    { title: "10 minutes of mobility", category: "health", difficulty: "easy", est_minutes: 10, quest_type: "recovery", verify: { kind: "mobility" } },
    { title: "Drink my water target", category: "health", difficulty: "easy", est_minutes: null, verify: { kind: "water" } },
    { title: "Get adequate sleep", category: "health", difficulty: "easy", est_minutes: null, quest_type: "recovery", verify: { kind: "sleep" }, note: "Counts only within your healthy sleep range" },
    { title: "Log bodyweight", category: "health", difficulty: "easy", est_minutes: 2, verify: { kind: "bodyweight" } },
    { title: "Take a planned rest day", category: "health", difficulty: "easy", est_minutes: null, quest_type: "recovery", verify: { kind: "rest" }, note: "Rest counts: mark the day as rest in Health" },
  ],
  life: [
    { title: "Plan tomorrow (5 minutes)", category: "life", difficulty: "easy", est_minutes: 5 },
    { title: "Tidy my workspace", category: "life", difficulty: "easy", est_minutes: 10 },
  ],
};

export const VERIFY_OPTIONS = [
  { kind: "", label: "No automatic check" },
  { kind: "protein", label: "Protein target logged" },
  { kind: "water", label: "Water target logged" },
  { kind: "sleep", label: "Sleep within healthy range" },
  { kind: "mobility", label: "Mobility minutes logged" },
  { kind: "bodyweight", label: "Bodyweight logged" },
  { kind: "workout", label: "Workout logged" },
  { kind: "rest", label: "Rest day marked" },
  { kind: "practice", label: "Basketball session logged" },
  { kind: "focus", label: "Focused minutes logged" },
  { kind: "shooting", label: "Shot attempts logged" },
] as const;
