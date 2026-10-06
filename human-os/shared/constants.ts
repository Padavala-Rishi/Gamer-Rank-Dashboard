// Enumerations shared by server validation and client UI.
// Each entry is [value, label]; the value is what is stored.

export type Option<T extends string = string> = readonly [T, string];

function values<T extends string>(opts: readonly Option<T>[]): [T, ...T[]] {
  return opts.map((o) => o[0]) as [T, ...T[]];
}

export const PRIORITIES = [
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
] as const satisfies readonly Option[];
export const PRIORITY_VALUES = values(PRIORITIES);
export type Priority = (typeof PRIORITY_VALUES)[number];
export const PRIORITY_WEIGHT: Record<Priority, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export const TASK_STATUSES = [
  ["todo", "To do"],
  ["doing", "In progress"],
  ["done", "Done"],
  ["cancelled", "Cancelled"],
] as const satisfies readonly Option[];
export const TASK_STATUS_VALUES = values(TASK_STATUSES);

export const ENERGY_LEVELS = [
  ["low", "Low energy"],
  ["medium", "Medium energy"],
  ["high", "High energy"],
] as const satisfies readonly Option[];
export const ENERGY_VALUES = values(ENERGY_LEVELS);
export type Energy = (typeof ENERGY_VALUES)[number];

export const GOAL_HORIZONS = [
  ["long_term", "Long-term (3+ years)"],
  ["year", "Yearly"],
  ["quarter", "Quarterly"],
  ["month", "Monthly"],
  ["week", "Weekly"],
] as const satisfies readonly Option[];
export const GOAL_HORIZON_VALUES = values(GOAL_HORIZONS);
export const HORIZON_ORDER: Record<string, number> = { long_term: 0, year: 1, quarter: 2, month: 3, week: 4 };

export const GOAL_KINDS = [
  ["outcome", "Outcome — a result to achieve"],
  ["process", "Process — a behaviour to sustain"],
] as const satisfies readonly Option[];
export const GOAL_KIND_VALUES = values(GOAL_KINDS);

export const GOAL_STATUSES = [
  ["active", "Active"],
  ["paused", "Paused"],
  ["achieved", "Achieved"],
  ["dropped", "Dropped"],
] as const satisfies readonly Option[];
export const GOAL_STATUS_VALUES = values(GOAL_STATUSES);

export const PROGRESS_MODES = [
  ["milestones", "Milestones completed"],
  ["metric", "Metric (start → target)"],
  ["tasks", "Linked tasks completed"],
  ["manual", "Manual estimate"],
] as const satisfies readonly Option[];
export const PROGRESS_MODE_VALUES = values(PROGRESS_MODES);

export const PROJECT_STATUSES = [
  ["planned", "Planned"],
  ["active", "Active"],
  ["on_hold", "On hold"],
  ["done", "Done"],
  ["archived", "Archived"],
] as const satisfies readonly Option[];
export const PROJECT_STATUS_VALUES = values(PROJECT_STATUSES);

export const HABIT_FREQUENCIES = [
  ["daily", "Every day"],
  ["days", "Specific days"],
  ["weekly", "N times per week"],
] as const satisfies readonly Option[];
export const HABIT_FREQUENCY_VALUES = values(HABIT_FREQUENCIES);

export const HABIT_LOG_STATUSES = [
  ["done", "Target reached"],
  ["minimum", "Minimum version"],
  ["skipped", "Skipped (intentional)"],
] as const satisfies readonly Option[];
export const HABIT_LOG_STATUS_VALUES = values(HABIT_LOG_STATUSES);

export const EVENT_KINDS = [
  ["focus", "Deep work"],
  ["study", "Study"],
  ["exercise", "Exercise"],
  ["meeting", "Meeting"],
  ["admin", "Admin"],
  ["meal", "Meal"],
  ["personal", "Personal"],
  ["social", "Relationships"],
  ["rest", "Rest / recovery"],
  ["sleep", "Sleep"],
  ["other", "Other"],
] as const satisfies readonly Option[];
export const EVENT_KIND_VALUES = values(EVENT_KINDS);

export const EVENT_RECURRENCES = [
  ["none", "Does not repeat"],
  ["daily", "Every day"],
  ["weekdays", "Every weekday"],
  ["weekly", "Every week"],
] as const satisfies readonly Option[];
export const EVENT_RECURRENCE_VALUES = values(EVENT_RECURRENCES);

export const FOCUS_KINDS = [
  ["pomodoro", "Pomodoro (25m)"],
  ["deep_work", "Deep work (90m)"],
  ["study", "Study session"],
  ["custom", "Custom"],
] as const satisfies readonly Option[];
export const FOCUS_KIND_VALUES = values(FOCUS_KINDS);

export const DISTRACTION_KINDS = [
  ["phone", "Phone"],
  ["social", "Social media"],
  ["youtube", "YouTube / video"],
  ["gaming", "Gaming"],
  ["messaging", "Messaging"],
  ["browsing", "Random browsing"],
  ["thoughts", "Wandering thoughts"],
  ["people", "Someone interrupted"],
  ["other", "Other"],
] as const satisfies readonly Option[];
export const DISTRACTION_KIND_VALUES = values(DISTRACTION_KINDS);

export const JOURNAL_KINDS = [
  ["daily", "Daily reflection"],
  ["free", "Free writing"],
  ["gratitude", "Gratitude"],
  ["checkin", "Mental check-in"],
  ["goal", "Goal reflection"],
  ["lessons", "Lessons learned"],
  ["relationships", "Relationship check-in"],
] as const satisfies readonly Option[];
export const JOURNAL_KIND_VALUES = values(JOURNAL_KINDS);

export const JOURNAL_PROMPTS: Record<string, string[]> = {
  daily: [
    "What went well?",
    "What went badly?",
    "What did I learn?",
    "What am I avoiding?",
    "What matters tomorrow?",
    "What should I change?",
  ],
  gratitude: ["Three things I'm grateful for", "Someone who made today better", "A small moment worth remembering"],
  checkin: [
    "What am I feeling?",
    "What is affecting me?",
    "What do I need?",
    "What can I control?",
    "What should I let go of?",
  ],
  goal: ["Which goal am I reflecting on, and why now?", "What is working?", "What is not working?", "What will I adjust?"],
  lessons: ["What happened?", "What did it teach me?", "How will I apply it?"],
  relationships: ["Who matters most to me right now?", "Who have I neglected?", "Who should I contact this week?", "Which relationships deserve more effort?"],
  free: [],
};

export const MASTERY_LEVELS = [
  ["0", "Not started"],
  ["1", "Learning"],
  ["2", "Practised"],
  ["3", "Confident"],
  ["4", "Mastered"],
] as const satisfies readonly Option[];

export const SUBJECT_KINDS = [
  ["subject", "Subject"],
  ["course", "Course"],
] as const satisfies readonly Option[];
export const SUBJECT_KIND_VALUES = values(SUBJECT_KINDS);

export const LEARNING_STATUSES = [
  ["active", "Active"],
  ["paused", "Paused"],
  ["completed", "Completed"],
] as const satisfies readonly Option[];
export const LEARNING_STATUS_VALUES = values(LEARNING_STATUSES);

export const RESOURCE_KINDS = [
  ["book", "Book"],
  ["video", "Video"],
  ["course", "Course"],
  ["article", "Article"],
  ["notes", "Notes"],
  ["practice", "Practice set"],
  ["other", "Other"],
] as const satisfies readonly Option[];
export const RESOURCE_KIND_VALUES = values(RESOURCE_KINDS);

export const RESOURCE_STATUSES = [
  ["todo", "Not started"],
  ["in_progress", "In progress"],
  ["done", "Done"],
] as const satisfies readonly Option[];
export const RESOURCE_STATUS_VALUES = values(RESOURCE_STATUSES);

export const ASSESSMENT_KINDS = [
  ["exam", "Exam"],
  ["assignment", "Assignment"],
  ["quiz", "Quiz"],
  ["project", "Project"],
] as const satisfies readonly Option[];
export const ASSESSMENT_KIND_VALUES = values(ASSESSMENT_KINDS);

export const ASSESSMENT_STATUSES = [
  ["upcoming", "Upcoming"],
  ["submitted", "Submitted"],
  ["graded", "Graded"],
] as const satisfies readonly Option[];
export const ASSESSMENT_STATUS_VALUES = values(ASSESSMENT_STATUSES);

export const SKILL_DOMAINS = [
  ["career", "Career skill"],
  ["personal", "Personal development"],
] as const satisfies readonly Option[];
export const SKILL_DOMAIN_VALUES = values(SKILL_DOMAINS);

export const SKILL_LEVELS = [
  ["0", "0 · None"],
  ["1", "1 · Aware"],
  ["2", "2 · Beginner"],
  ["3", "3 · Competent"],
  ["4", "4 · Proficient"],
  ["5", "5 · Expert"],
] as const satisfies readonly Option[];

export const EVIDENCE_KINDS = [
  ["project", "Project"],
  ["practice", "Practice session"],
  ["certification", "Certification"],
  ["resource", "Learning resource"],
  ["achievement", "Achievement"],
  ["feedback", "Feedback received"],
] as const satisfies readonly Option[];
export const EVIDENCE_KIND_VALUES = values(EVIDENCE_KINDS);

export const APPLICATION_STATUSES = [
  ["wishlist", "Wishlist"],
  ["applied", "Applied"],
  ["interviewing", "Interviewing"],
  ["offer", "Offer"],
  ["rejected", "Rejected"],
  ["withdrawn", "Withdrawn"],
] as const satisfies readonly Option[];
export const APPLICATION_STATUS_VALUES = values(APPLICATION_STATUSES);

export const ACCOUNT_KINDS = [
  ["cash", "Cash"],
  ["checking", "Bank account"],
  ["savings", "Savings"],
  ["investment", "Investment"],
  ["credit", "Credit card"],
  ["loan", "Loan / debt"],
  ["other", "Other"],
] as const satisfies readonly Option[];
export const ACCOUNT_KIND_VALUES = values(ACCOUNT_KINDS);
export const LIABILITY_KINDS = new Set(["credit", "loan"]);

export const TRANSACTION_KINDS = [
  ["expense", "Expense"],
  ["income", "Income"],
  ["transfer", "Transfer"],
] as const satisfies readonly Option[];
export const TRANSACTION_KIND_VALUES = values(TRANSACTION_KINDS);

export const EXPENSE_CATEGORIES = [
  "Housing",
  "Food",
  "Transport",
  "Utilities",
  "Education",
  "Health",
  "Shopping",
  "Entertainment",
  "Subscriptions",
  "Travel",
  "Gifts",
  "Other",
];
export const INCOME_CATEGORIES = ["Salary", "Freelance", "Allowance", "Scholarship", "Investment", "Other"];

export const BILLING_CYCLES = [
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["yearly", "Yearly"],
] as const satisfies readonly Option[];
export const BILLING_CYCLE_VALUES = values(BILLING_CYCLES);

export const FIN_GOAL_KINDS = [
  ["savings", "Savings target"],
  ["emergency", "Emergency fund"],
  ["purchase", "Purchase"],
  ["investment", "Invest regularly"],
  ["debt", "Pay off debt"],
  ["net_worth", "Net worth target"],
] as const satisfies readonly Option[];
export const FIN_GOAL_KIND_VALUES = values(FIN_GOAL_KINDS);

export const RELATIONS = [
  ["family", "Family"],
  ["partner", "Partner"],
  ["friend", "Friend"],
  ["colleague", "Colleague"],
  ["mentor", "Mentor"],
  ["other", "Other"],
] as const satisfies readonly Option[];
export const RELATION_VALUES = values(RELATIONS);

export const INTERACTION_KINDS = [
  ["in_person", "In person"],
  ["call", "Call"],
  ["video", "Video call"],
  ["message", "Message"],
  ["other", "Other"],
] as const satisfies readonly Option[];
export const INTERACTION_KIND_VALUES = values(INTERACTION_KINDS);

export const WORKOUT_KINDS = [
  ["strength", "Strength"],
  ["cardio", "Cardio"],
  ["mobility", "Mobility / yoga"],
  ["sport", "Sport"],
  ["walk", "Walk"],
  ["other", "Other"],
] as const satisfies readonly Option[];
export const WORKOUT_KIND_VALUES = values(WORKOUT_KINDS);

export const INTENSITIES = [
  ["easy", "Easy"],
  ["moderate", "Moderate"],
  ["hard", "Hard"],
] as const satisfies readonly Option[];
export const INTENSITY_VALUES = values(INTENSITIES);

export const METRIC_KINDS = [
  ["number", "Number"],
  ["scale", "Scale 1–5"],
  ["boolean", "Yes / no"],
] as const satisfies readonly Option[];
export const METRIC_KIND_VALUES = values(METRIC_KINDS);

export const METRIC_DIRECTIONS = [
  ["higher", "Higher is better"],
  ["lower", "Lower is better"],
  ["target", "Closer to target is better"],
] as const satisfies readonly Option[];
export const METRIC_DIRECTION_VALUES = values(METRIC_DIRECTIONS);

export const ENVIRONMENT_AREAS = [
  ["workspace", "Workspace"],
  ["digital", "Digital clutter"],
  ["notifications", "Notifications"],
  ["sleep", "Sleep environment"],
  ["study", "Study environment"],
  ["social", "Social environment"],
] as const satisfies readonly Option[];
export const ENVIRONMENT_AREA_VALUES = values(ENVIRONMENT_AREAS);

export const REVIEW_KINDS = [
  ["weekly", "Weekly review"],
  ["monthly", "Monthly review"],
  ["quarterly", "Quarterly review"],
] as const satisfies readonly Option[];
export const REVIEW_KIND_VALUES = values(REVIEW_KINDS);

export const REVIEW_PROMPTS: Record<string, string[]> = {
  weekly: [
    "What actually moved my life forward?",
    "What wasted my time?",
    "What am I avoiding?",
    "What should I stop doing?",
    "What should I continue?",
    "What should I start?",
  ],
  monthly: [
    "What were the major achievements?",
    "Which goals slipped, and why?",
    "What important events happened?",
    "Is my current behaviour aligned with the life I say I want?",
    "What will I do differently next month?",
  ],
  quarterly: [
    "Does my vision still feel true?",
    "Where did my time actually go this quarter?",
    "Which life area was neglected?",
    "What did I learn about how I work best?",
    "What is the one thing that would make next quarter a success?",
  ],
};

export const LIFE_AREA_FOCUS = [
  ["attention", "Needs attention"],
  ["maintain", "Maintain"],
  ["thriving", "Thriving"],
] as const satisfies readonly Option[];
export const LIFE_AREA_FOCUS_VALUES = values(LIFE_AREA_FOCUS);

export const DEFAULT_LIFE_AREAS: { key: string; name: string; color: string; icon: string; description: string }[] = [
  { key: "health", name: "Physical Health", color: "#4f8a6e", icon: "heart-pulse", description: "Sleep, movement, nutrition, recovery." },
  { key: "mind", name: "Mind & Wellbeing", color: "#7a6aa8", icon: "brain", description: "Mood, stress, emotional health, reflection." },
  { key: "learning", name: "Education & Learning", color: "#3f73a8", icon: "graduation-cap", description: "Courses, study, knowledge." },
  { key: "career", name: "Career & Skills", color: "#b7793a", icon: "briefcase", description: "Work, skills, projects, opportunities." },
  { key: "finance", name: "Finance", color: "#5b8a3a", icon: "wallet", description: "Income, spending, saving, investing." },
  { key: "relationships", name: "Relationships", color: "#b35a6b", icon: "users", description: "Family, friends, community." },
  { key: "growth", name: "Personal Growth", color: "#4a8a93", icon: "sprout", description: "Character, habits, communication, creativity." },
  { key: "purpose", name: "Purpose & Values", color: "#8a7a3a", icon: "compass", description: "Meaning, contribution, direction." },
];

export const AREA_COLORS = ["#4f8a6e", "#7a6aa8", "#3f73a8", "#b7793a", "#5b8a3a", "#b35a6b", "#4a8a93", "#8a7a3a", "#6b7280", "#9a5b9e"];

export const SUGGESTED_VALUES = [
  "Health",
  "Freedom",
  "Family",
  "Excellence",
  "Curiosity",
  "Creativity",
  "Integrity",
  "Wealth",
  "Adventure",
  "Contribution",
  "Growth",
  "Kindness",
  "Courage",
  "Discipline",
  "Peace",
];

export const AUDIT_AREAS = [
  ["health", "Physical health"],
  ["mind", "Mental wellbeing"],
  ["education", "Education"],
  ["career", "Career"],
  ["finance", "Finance"],
  ["relationships", "Relationships"],
  ["growth", "Personal growth"],
  ["environment", "Environment"],
  ["time", "Time use"],
  ["purpose", "Purpose"],
] as const satisfies readonly Option[];
export const AUDIT_AREA_VALUES = values(AUDIT_AREAS);

export const DASHBOARD_WIDGETS = [
  ["now", "What should I do now?"],
  ["priorities", "Today's priorities"],
  ["schedule", "Upcoming schedule"],
  ["habits", "Habits"],
  ["checkin", "Health & recovery check-in"],
  ["snapshot", "Daily snapshot"],
  ["goals", "Goals needing attention"],
  ["focus", "Focus"],
  ["reflection", "Daily reflection"],
  ["people", "People to reach out to"],
  ["learning", "Flashcards due"],
] as const satisfies readonly Option[];
export const DASHBOARD_WIDGET_VALUES = values(DASHBOARD_WIDGETS);
export const ALL_WIDGETS: (typeof DASHBOARD_WIDGETS)[number][0][] = DASHBOARD_WIDGETS.map((w) => w[0]);

// "Simple view" is the default: a short menu and a calm dashboard. Nothing is removed;
// everything else is one switch away in Settings → Appearance (and always reachable by search).
export const SIMPLE_HIDDEN_NAV = ["/projects", "/compass", "/learning", "/career", "/health", "/finance", "/people", "/knowledge", "/reviews", "/analytics", "/assistant"];
export const SIMPLE_WIDGETS: (typeof DASHBOARD_WIDGETS)[number][0][] = ["now", "priorities", "habits", "schedule"];
export const DEFAULT_WIDGETS = SIMPLE_WIDGETS;

export const NOTIFICATION_KINDS = [
  ["deadline", "Upcoming & overdue deadlines"],
  ["habit", "Habit reminders"],
  ["review", "Review reminders"],
  ["milestone", "Goal milestones"],
  ["birthday", "Birthdays & follow-ups"],
  ["flashcards", "Flashcards due"],
  ["decision", "Decisions ready to review"],
] as const satisfies readonly Option[];
export const NOTIFICATION_KIND_VALUES = values(NOTIFICATION_KINDS);

export function label(opts: readonly Option[], value: string | null | undefined): string {
  if (value == null) return "";
  return opts.find((o) => o[0] === value)?.[1] ?? value;
}
