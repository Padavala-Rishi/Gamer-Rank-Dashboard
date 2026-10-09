// Static vocabulary used across the app. Colour tokens live in globals.css (--c-basketball etc.).

export const CATEGORY_KEYS = ["basketball", "college", "dev", "health"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export type AnyCategory = CategoryKey | "life";

export const CATEGORIES: Record<AnyCategory, { key: AnyCategory; name: string; short: string; attribute: string; icon: string; blurb: string; href: string }> = {
  basketball: { key: "basketball", name: "Basketball", short: "Hoops", attribute: "SKILL", icon: "basketball", blurb: "Point guard development", href: "/basketball" },
  college: { key: "college", name: "College", short: "Study", attribute: "KNOWLEDGE", icon: "graduation-cap", blurb: "Academic mastery", href: "/college" },
  dev: { key: "dev", name: "Development", short: "Code", attribute: "CAREER", icon: "code-xml", blurb: "Full-stack & freelancing", href: "/dev" },
  health: { key: "health", name: "Health & Physique", short: "Body", attribute: "VITALITY", icon: "heart-pulse", blurb: "Strength, recovery, physique", href: "/health" },
  life: { key: "life", name: "Life", short: "Life", attribute: "—", icon: "sparkles", blurb: "Everything else", href: "/quests" },
};

/** Fixed series order for charts (validated for colour-blind separation). Never re-ordered, never cycled. */
export const CHART_ORDER: CategoryKey[] = ["college", "basketball", "dev", "health"];

export const DIFFICULTIES = ["easy", "medium", "hard", "boss"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DEFAULT_XP: Record<Difficulty, number> = { easy: 10, medium: 25, hard: 50, boss: 100 };
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard", boss: "Boss Quest" };

export const QUEST_TYPES = ["daily", "weekly", "boss", "habit", "recovery", "challenge"] as const;
export type QuestType = (typeof QUEST_TYPES)[number];
export const QUEST_TYPE_LABEL: Record<QuestType, string> = {
  daily: "Daily", weekly: "Weekly", boss: "Boss", habit: "Habit", recovery: "Recovery", challenge: "Challenge",
};

export const PRIORITIES = [
  { value: 1, label: "High" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Low" },
] as const;

export const TASK_STATUSES = ["open", "done", "skipped", "discarded", "template"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// ── basketball ──
export const SKILLS = ["shooting", "ball_handling", "finishing", "passing", "decision_making", "defense", "conditioning", "footwork"] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_LABEL: Record<Skill, string> = {
  shooting: "Shooting", ball_handling: "Ball handling", finishing: "Finishing", passing: "Passing",
  decision_making: "Decision-making", defense: "Defense", conditioning: "Conditioning", footwork: "Footwork",
};

// ── development ──
export const TRACKS = [
  { key: "web_basics", label: "HTML, CSS & JavaScript" },
  { key: "react", label: "React & frontend" },
  { key: "backend", label: "Backend & APIs" },
  { key: "databases_auth", label: "Databases & auth" },
  { key: "git_github", label: "Git & GitHub" },
  { key: "deployment", label: "Deployment & hosting" },
  { key: "quality", label: "Testing, security & debugging" },
  { key: "ai_automation", label: "AI & automation" },
  { key: "portfolio", label: "Portfolio projects" },
  { key: "freelancing", label: "Freelancing & sales" },
] as const;
export type TrackKey = (typeof TRACKS)[number]["key"];

export const PROJECT_STAGES = ["planned", "building", "testing", "deployed", "completed"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];
export const PROJECT_STAGE_LABEL: Record<ProjectStage, string> = {
  planned: "Planned", building: "Building", testing: "Testing", deployed: "Deployed", completed: "Completed",
};

export const LEAD_STATUSES = ["identified", "contacted", "replied", "meeting", "proposal", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  identified: "Identified", contacted: "Contacted", replied: "Replied", meeting: "Meeting", proposal: "Proposal sent", won: "Won", lost: "Lost",
};

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "AED", "SGD"] as const;

// ── profile ──
export const AVATAR_ICONS = ["swords", "shield", "flame", "zap", "crown", "ghost", "rocket", "target", "mountain", "bird", "gem", "compass"] as const;
export const AVATAR_TONES = ["gold", "ember", "sky", "jade", "violet", "rose"] as const;
export type AvatarIcon = (typeof AVATAR_ICONS)[number];
export type AvatarTone = (typeof AVATAR_TONES)[number];

export const XP_PREFERENCES = {
  relaxed: { label: "Relaxed", blurb: "Levels come quickly. Good for building the habit.", base: 70, category_base: 40 },
  standard: { label: "Standard", blurb: "A steady climb.", base: 100, category_base: 60 },
  hardcore: { label: "Hardcore", blurb: "Levels are earned slowly.", base: 160, category_base: 100 },
} as const;
export type XpPreference = keyof typeof XP_PREFERENCES;

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
