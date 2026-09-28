// Ordered, append-only schema migrations. Never edit a shipped migration; add a new one.
//
// Conventions:
//  - ids are random UUIDs (TEXT)
//  - every user-owned row has user_id (FK → users, cascade on account deletion)
//  - every user-owned row has is_demo so demo data can be removed without touching real data
//  - dates are "YYYY-MM-DD" TEXT in the user's timezone; instants are ISO-8601 UTC TEXT
//  - booleans are INTEGER 0/1; JSON columns are TEXT

const base = `
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL`;

export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "initial schema",
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,               -- SHA-256 of the session token; the raw token only lives in the cookie
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,                -- JSON validated by profileSchema
  updated_at TEXT NOT NULL
);

CREATE TABLE visions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  identity TEXT, ideal_life TEXT, what_matters TEXT, non_negotiables TEXT,
  success_definition TEXT, regrets TEXT, current_reality TEXT, constraints TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE life_areas (${base},
  name TEXT NOT NULL, description TEXT, color TEXT NOT NULL, icon TEXT NOT NULL,
  focus TEXT NOT NULL DEFAULT 'maintain', sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_life_areas_user ON life_areas(user_id);

CREATE TABLE personal_values (${base},
  name TEXT NOT NULL, description TEXT, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_values_user ON personal_values(user_id);

CREATE TABLE goals (${base},
  title TEXT NOT NULL, description TEXT, why TEXT,
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  horizon TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, is_focus INTEGER NOT NULL DEFAULT 0,
  start_date TEXT, deadline TEXT, progress_mode TEXT NOT NULL,
  metric_name TEXT, metric_unit TEXT, metric_start REAL, metric_current REAL, metric_target REAL,
  manual_progress INTEGER, risks TEXT, dependencies TEXT, achieved_at TEXT
);
CREATE INDEX idx_goals_user ON goals(user_id, status);
CREATE INDEX idx_goals_parent ON goals(parent_id);

CREATE TABLE goal_values (
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  value_id TEXT NOT NULL REFERENCES personal_values(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, value_id)
);

CREATE TABLE milestones (${base},
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL, due_date TEXT, completed_at TEXT, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_milestones_goal ON milestones(goal_id);

CREATE TABLE projects (${base},
  title TEXT NOT NULL, description TEXT,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  status TEXT NOT NULL, start_date TEXT, deadline TEXT, color TEXT, notes TEXT, completed_at TEXT
);
CREATE INDEX idx_projects_user ON projects(user_id, status);

CREATE TABLE tasks (${base},
  title TEXT NOT NULL, notes TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  priority TEXT NOT NULL, status TEXT NOT NULL,
  due_date TEXT, due_time TEXT, scheduled_date TEXT, mit_date TEXT,
  estimate_min INTEGER, actual_min INTEGER, energy TEXT, context TEXT, recurrence TEXT,
  first_step TEXT, snoozed_until TEXT, sort_order REAL NOT NULL DEFAULT 0, completed_at TEXT,
  recurrence_source_id TEXT
);
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_due ON tasks(user_id, due_date);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_goal ON tasks(goal_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);

CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);

CREATE TABLE habits (${base},
  title TEXT NOT NULL, description TEXT,
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL, days TEXT NOT NULL DEFAULT '[]', times_per_week INTEGER,
  target_value REAL, minimum_value REAL, unit TEXT, cue TEXT, color TEXT,
  paused INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_habits_user ON habits(user_id);

CREATE TABLE habit_logs (${base},
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL, status TEXT NOT NULL, value REAL, note TEXT,
  UNIQUE (habit_id, date)
);
CREATE INDEX idx_habit_logs_user_date ON habit_logs(user_id, date);

CREATE TABLE calendar_events (${base},
  title TEXT NOT NULL, kind TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  location TEXT, notes TEXT, recurrence TEXT NOT NULL DEFAULT 'none', recurrence_until TEXT,
  CHECK (end_at > start_at)
);
CREATE INDEX idx_events_user_start ON calendar_events(user_id, start_at);

CREATE TABLE subjects (${base},
  title TEXT NOT NULL, kind TEXT NOT NULL, description TEXT, provider TEXT,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  color TEXT, status TEXT NOT NULL, weekly_target_min INTEGER
);
CREATE INDEX idx_subjects_user ON subjects(user_id);

CREATE TABLE topics (${base},
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, mastery INTEGER NOT NULL DEFAULT 0, notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0, next_review TEXT, last_studied TEXT
);
CREATE INDEX idx_topics_subject ON topics(subject_id);

CREATE TABLE focus_sessions (${base},
  kind TEXT NOT NULL, objective TEXT,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  planned_min INTEGER NOT NULL, started_at TEXT, ended_at TEXT, actual_min INTEGER,
  status TEXT NOT NULL, accomplished TEXT, distraction_notes TEXT, change_next TEXT, quality INTEGER,
  local_date TEXT
);
CREATE INDEX idx_focus_user_date ON focus_sessions(user_id, local_date);

CREATE TABLE distractions (${base},
  session_id TEXT REFERENCES focus_sessions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL, note TEXT, occurred_at TEXT NOT NULL, local_date TEXT, local_hour INTEGER
);
CREATE INDEX idx_distractions_user ON distractions(user_id, occurred_at);

CREATE TABLE journal_entries (${base},
  kind TEXT NOT NULL, entry_date TEXT NOT NULL, title TEXT, body TEXT, answers TEXT NOT NULL DEFAULT '{}',
  mood INTEGER, goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL
);
CREATE INDEX idx_journal_user_date ON journal_entries(user_id, entry_date);

CREATE TABLE decisions (${base},
  title TEXT NOT NULL, context TEXT, options TEXT, chosen TEXT, reasoning TEXT, assumptions TEXT,
  risks TEXT, expected_outcome TEXT, confidence INTEGER, decided_on TEXT NOT NULL, review_on TEXT,
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL, status TEXT NOT NULL
);
CREATE INDEX idx_decisions_user ON decisions(user_id);

CREATE TABLE decision_reviews (${base},
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  reviewed_on TEXT NOT NULL, actual_outcome TEXT, outcome_vs_expected TEXT NOT NULL,
  assumptions_held TEXT, lessons TEXT, would_decide_same INTEGER
);

CREATE TABLE reviews (${base},
  kind TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}', priorities TEXT NOT NULL DEFAULT '[]', goal_decisions TEXT NOT NULL DEFAULT '{}',
  snapshot TEXT, status TEXT NOT NULL, completed_at TEXT,
  UNIQUE (user_id, kind, period_start)
);

CREATE TABLE learning_resources (${base},
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL, url TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, notes TEXT
);

CREATE TABLE flashcards (${base},
  subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  front TEXT NOT NULL, back TEXT NOT NULL,
  ease REAL NOT NULL DEFAULT 2.5, interval_days INTEGER NOT NULL DEFAULT 0, repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0, due_date TEXT NOT NULL, last_reviewed TEXT
);
CREATE INDEX idx_flashcards_due ON flashcards(user_id, due_date);

CREATE TABLE assessments (${base},
  subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, kind TEXT NOT NULL, due_date TEXT NOT NULL, due_time TEXT,
  weight REAL, score REAL, max_score REAL, status TEXT NOT NULL, notes TEXT
);

CREATE TABLE skills (${base},
  title TEXT NOT NULL, domain TEXT NOT NULL, category TEXT, description TEXT,
  current_level INTEGER NOT NULL DEFAULT 0, target_level INTEGER NOT NULL DEFAULT 3,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL
);

CREATE TABLE skill_prerequisites (
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  prerequisite_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (skill_id, prerequisite_id),
  CHECK (skill_id <> prerequisite_id)
);

CREATE TABLE skill_evidence (${base},
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, url TEXT, occurred_on TEXT NOT NULL, minutes INTEGER, notes TEXT
);

CREATE TABLE people (${base},
  name TEXT NOT NULL, relation TEXT NOT NULL, birthday TEXT, contact_every_days INTEGER,
  important INTEGER NOT NULL DEFAULT 0, how_to_reach TEXT, notes TEXT, follow_up TEXT
);

CREATE TABLE interactions (${base},
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  occurred_on TEXT NOT NULL, kind TEXT NOT NULL, note TEXT
);
CREATE INDEX idx_interactions_person ON interactions(person_id, occurred_on);

CREATE TABLE applications (${base},
  company TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, applied_on TEXT,
  next_step TEXT, next_step_on TEXT, url TEXT,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL, notes TEXT
);

CREATE TABLE financial_accounts (${base},
  name TEXT NOT NULL, kind TEXT NOT NULL, opening_balance REAL NOT NULL DEFAULT 0,
  include_in_net_worth INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0, notes TEXT
);

CREATE TABLE transactions (${base},
  account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  to_account_id TEXT REFERENCES financial_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, amount REAL NOT NULL CHECK (amount > 0), occurred_on TEXT NOT NULL,
  category TEXT, note TEXT
);
CREATE INDEX idx_transactions_user_date ON transactions(user_id, occurred_on);

CREATE TABLE budgets (${base},
  category TEXT NOT NULL, monthly_limit REAL NOT NULL,
  UNIQUE (user_id, category)
);

CREATE TABLE subscriptions (${base},
  name TEXT NOT NULL, amount REAL NOT NULL, cycle TEXT NOT NULL, next_renewal TEXT, category TEXT,
  active INTEGER NOT NULL DEFAULT 1, notes TEXT
);

CREATE TABLE financial_goals (${base},
  title TEXT NOT NULL, kind TEXT NOT NULL, target_amount REAL NOT NULL, current_amount REAL,
  account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL,
  monthly_contribution REAL, deadline TEXT,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL, notes TEXT
);

CREATE TABLE notes (${base},
  title TEXT NOT NULL, body TEXT, folder TEXT, pinned INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_notes_user ON notes(user_id);

CREATE TABLE tags (${base},
  name TEXT NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE note_links (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY (note_id, entity_type, entity_id)
);
CREATE INDEX idx_note_links_entity ON note_links(entity_type, entity_id);

CREATE TABLE checkins (${base},
  entry_date TEXT NOT NULL, sleep_hours REAL, sleep_quality INTEGER, mood INTEGER, energy INTEGER,
  stress INTEGER, nutrition INTEGER, steps INTEGER, water_glasses INTEGER, screen_min INTEGER,
  rest_day INTEGER NOT NULL DEFAULT 0, emotions TEXT NOT NULL DEFAULT '[]', notes TEXT,
  UNIQUE (user_id, entry_date)
);

CREATE TABLE workouts (${base},
  occurred_on TEXT NOT NULL, kind TEXT NOT NULL, duration_min INTEGER NOT NULL, intensity TEXT NOT NULL, notes TEXT
);
CREATE INDEX idx_workouts_user_date ON workouts(user_id, occurred_on);

CREATE TABLE metrics (${base},
  name TEXT NOT NULL, unit TEXT, life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  kind TEXT NOT NULL, direction TEXT NOT NULL, target REAL, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE metric_entries (${base},
  metric_id TEXT NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL, value REAL NOT NULL, note TEXT,
  UNIQUE (metric_id, entry_date)
);

CREATE TABLE environment_checks (${base},
  area TEXT NOT NULL, checked_on TEXT NOT NULL, rating INTEGER NOT NULL, note TEXT, change_idea TEXT
);

CREATE TABLE notifications (${base},
  kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, dedupe_key TEXT NOT NULL,
  read_at TEXT, dismissed_at TEXT,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);

CREATE TABLE ai_conversations (${base},
  title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'chat'
);

CREATE TABLE ai_messages (${base},
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL
);
CREATE INDEX idx_ai_messages_conv ON ai_messages(conversation_id, created_at);

CREATE TABLE life_audits (${base},
  ratings TEXT NOT NULL, answers TEXT NOT NULL DEFAULT '{}', snapshot TEXT NOT NULL,
  findings TEXT NOT NULL, ai_interpretation TEXT
);
`,
  },
];
