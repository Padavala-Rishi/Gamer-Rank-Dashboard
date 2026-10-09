-- Level Up — schema
-- Targets Supabase (PostgreSQL 15+, auth schema, auth.uid(), roles anon / authenticated).
--
-- Conventions
--  * Every user-owned row has user_id (defaults to auth.uid()) and RLS restricts access to it.
--  * Cross-table references are composite (id, user_id) so a row can never point at another user's row.
--  * XP, completions, activity and achievements are READ-ONLY for clients. They are written only by the
--    SECURITY DEFINER functions in 0002_functions.sql.

-- ───────────────────────────── helpers ─────────────────────────────

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.valid_xp_values(v jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'object'
     and (v->>'easy')   ~ '^[0-9]{1,3}$' and (v->>'medium') ~ '^[0-9]{1,3}$'
     and (v->>'hard')   ~ '^[0-9]{1,3}$' and (v->>'boss')   ~ '^[0-9]{1,3}$'
     and (v->>'easy')::int   between 1 and 500
     and (v->>'easy')::int   <= (v->>'medium')::int
     and (v->>'medium')::int <= (v->>'hard')::int
     and (v->>'hard')::int   <= (v->>'boss')::int
     and (v->>'boss')::int   <= 500
$$;

-- ───────────────────────────── reference data ─────────────────────────────

create table public.categories (
  key        text primary key,
  name       text not null,
  attribute  text,
  icon       text not null,
  sort       int  not null
);

create table public.achievement_defs (
  key         text primary key,
  name        text not null,
  description text not null,
  category    text references public.categories(key),
  icon        text not null,
  metric      text not null,
  threshold   numeric not null,
  title       text,
  tier        int not null default 1,
  sort        int not null default 0
);

-- ───────────────────────────── identity ─────────────────────────────

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  character_name text not null default 'Player One' check (char_length(btrim(character_name)) between 1 and 40),
  avatar         jsonb not null default '{"icon":"swords","tone":"gold"}'::jsonb,
  active_title   text,
  timezone       text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  onboarded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.user_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  theme                text not null default 'dark' check (theme in ('dark','light')),
  -- Level curve: XP needed to REACH level L = round(base * (L-1) ^ exponent). Editable, never hard-coded elsewhere.
  level_base           numeric not null default 100 check (level_base between 20 and 1000),
  level_exponent       numeric not null default 1.6 check (level_exponent between 1.1 and 2.5),
  category_level_base  numeric not null default 60  check (category_level_base between 10 and 1000),
  xp_preference        text not null default 'standard' check (xp_preference in ('relaxed','standard','hardcore')),
  xp_values            jsonb not null default '{"easy":10,"medium":25,"hard":50,"boss":100}'::jsonb check (public.valid_xp_values(xp_values)),
  daily_task_limit     int not null default 8 check (daily_task_limit between 1 and 30),
  -- Free minutes per weekday that can go to goals (outside classes/work). Keys mon..sun.
  availability         jsonb not null default '{"mon":180,"tue":180,"wed":180,"thu":180,"fri":180,"sat":300,"sun":240}'::jsonb,
  commitments          jsonb not null default '[]'::jsonb,   -- [{title, days:[1..7], start:"HH:MM", end:"HH:MM"}]
  rest_weekdays        int[] not null default '{}' check (rest_weekdays <@ array[1,2,3,4,5,6,7]),
  mvd_minutes          int not null default 60 check (mvd_minutes between 15 and 240),
  currency             text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  targets              jsonb not null default '{"protein_g":120,"water_ml":3000,"sleep_min_h":7,"sleep_max_h":10,"mobility_min":10,"calories":null,"study_weekly_min":600,"coding_weekly_min":600,"practice_weekly":4,"workouts_weekly":4,"income_monthly":30000}'::jsonb,
  goals                jsonb not null default '{}'::jsonb,   -- per category: {goal, level}
  pomodoro             jsonb not null default '{"focus":25,"short":5,"long":15,"cycles":4}'::jsonb,
  ai_consent           boolean not null default false,
  week_starts_on       int not null default 1 check (week_starts_on in (0,1)),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ───────────────────────────── college ─────────────────────────────

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  code        text check (char_length(code) <= 20),
  color       text not null default 'slate' check (char_length(color) <= 20),
  weekly_target_min int not null default 180 check (weekly_target_min between 0 and 3000),
  archived    boolean not null default false,
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);

create table public.syllabus_nodes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade default auth.uid(),
  subject_id       uuid not null,
  parent_id        uuid,
  kind             text not null default 'topic' check (kind in ('unit','topic','subtopic')),
  title            text not null check (char_length(btrim(title)) between 1 and 160),
  sort_order       double precision not null default 0,
  status           text not null default 'todo' check (status in ('todo','learning','done')),
  done_on          date,
  revision_count   int not null default 0 check (revision_count >= 0),
  last_revised_on  date,
  next_revision_on date,
  notes            text check (char_length(notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects(id, user_id) on delete cascade,
  foreign key (parent_id, user_id)  references public.syllabus_nodes(id, user_id) on delete cascade
);
create index on public.syllabus_nodes (user_id, subject_id);

create table public.exams (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  subject_id  uuid,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  exam_date   date not null,
  exam_time   time,
  location    text check (char_length(location) <= 120),
  weight_pct  numeric check (weight_pct between 0 and 100),
  status      text not null default 'upcoming' check (status in ('upcoming','taken')),
  score_pct   numeric check (score_pct between 0 and 100),
  notes       text check (char_length(notes) <= 2000),
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects(id, user_id) on delete cascade
);
create index on public.exams (user_id, exam_date);

-- ───────────────────────────── development & freelancing ─────────────────────────────

create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name          text not null check (char_length(btrim(name)) between 1 and 100),
  description   text check (char_length(description) <= 2000),
  stage         text not null default 'planned' check (stage in ('planned','building','testing','deployed','completed')),
  repo_url      text check (char_length(repo_url) <= 300 and (repo_url is null or repo_url ~* '^https?://')),
  live_url      text check (char_length(live_url) <= 300 and (live_url is null or live_url ~* '^https?://')),
  skills        text[] not null default '{}' check (cardinality(skills) <= 30),
  is_client_work boolean not null default false,
  features_total int not null default 0 check (features_total between 0 and 500),
  features_done  int not null default 0 check (features_done between 0 and 500 and features_done <= features_total),
  started_on    date,
  deployed_on   date,
  completed_on  date,
  is_sample     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id)
);

create table public.roadmap_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  track        text not null check (track in ('web_basics','react','backend','databases_auth','git_github','deployment','quality','ai_automation','portfolio','freelancing')),
  title        text not null check (char_length(btrim(title)) between 1 and 160),
  status       text not null default 'todo' check (status in ('todo','doing','done')),
  done_on      date,
  resource_url text check (char_length(resource_url) <= 300 and (resource_url is null or resource_url ~* '^https?://')),
  notes        text check (char_length(notes) <= 2000),
  sort_order   double precision not null default 0,
  is_sample    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);
create index on public.roadmap_items (user_id, track);

create table public.freelance_leads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  company         text check (char_length(company) <= 120),
  channel         text check (char_length(channel) <= 40),
  contact         text check (char_length(contact) <= 200),
  status          text not null default 'identified' check (status in ('identified','contacted','replied','meeting','proposal','won','lost')),
  expected_value  numeric(12,2) check (expected_value >= 0),
  currency        text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  next_followup_on date,
  lost_reason     text check (char_length(lost_reason) <= 300),
  notes           text check (char_length(notes) <= 2000),
  status_changed_at timestamptz not null default now(),
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id)
);

create table public.outreach_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  lead_id     uuid not null,
  kind        text not null check (kind in ('message','followup','proposal','reply','meeting','note')),
  occurred_on date not null,
  summary     text check (char_length(summary) <= 500),
  created_at  timestamptz not null default now(),
  foreign key (lead_id, user_id) references public.freelance_leads(id, user_id) on delete cascade
);
create index on public.outreach_log (user_id, occurred_on);

-- Money only exists here when the user records it. Learning hours never become income.
create table public.income_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind        text not null check (kind in ('invoice','payment')),
  amount      numeric(12,2) not null check (amount > 0),
  currency    text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  occurred_on date not null,
  due_on      date,
  invoice_id  uuid,
  lead_id     uuid,
  project_id  uuid,
  client      text check (char_length(client) <= 120),
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  check (kind = 'payment' or invoice_id is null),
  foreign key (invoice_id, user_id) references public.income_records(id, user_id) on delete restrict,
  foreign key (lead_id, user_id)    references public.freelance_leads(id, user_id) on delete set null (lead_id),
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete set null (project_id)
);
create index on public.income_records (user_id, occurred_on);

-- ───────────────────────────── basketball ─────────────────────────────

create table public.drills (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name            text not null check (char_length(btrim(name)) between 1 and 100),
  skill           text not null default 'ball_handling' check (skill in ('shooting','ball_handling','finishing','passing','decision_making','defense','conditioning','footwork')),
  default_minutes int check (default_minutes between 1 and 240),
  default_reps    int check (default_reps between 1 and 2000),
  notes           text check (char_length(notes) <= 1000),
  archived        boolean not null default false,
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id)
);

create table public.practice_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  weekdays    int[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7]),
  items       jsonb not null default '[]'::jsonb,        -- [{drill_id?, name, minutes?, reps?}]
  notes       text check (char_length(notes) <= 1000),
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);

create table public.practice_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  session_date  date not null,
  plan_id       uuid,
  title         text not null default 'Practice' check (char_length(btrim(title)) between 1 and 100),
  status        text not null default 'planned' check (status in ('planned','done')),
  duration_min  int check (duration_min between 1 and 600),
  intensity     int check (intensity between 1 and 10),
  notes         text check (char_length(notes) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  foreign key (plan_id, user_id) references public.practice_plans(id, user_id) on delete set null (plan_id)
);
create index on public.practice_sessions (user_id, session_date);

create table public.practice_drills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  session_id   uuid not null,
  drill_id     uuid,
  name         text not null check (char_length(btrim(name)) between 1 and 100),
  planned_reps int check (planned_reps between 1 and 2000),
  done_reps    int check (done_reps between 0 and 5000),
  minutes      int check (minutes between 1 and 240),
  completed    boolean not null default false,
  notes        text check (char_length(notes) <= 500),
  sort_order   double precision not null default 0,
  created_at   timestamptz not null default now(),
  foreign key (session_id, user_id) references public.practice_sessions(id, user_id) on delete cascade,
  foreign key (drill_id, user_id)   references public.drills(id, user_id) on delete set null (drill_id)
);
create index on public.practice_drills (user_id, session_id);

create table public.bball_metrics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  kind       text not null default 'shooting' check (kind in ('shooting','value')),
  unit       text check (char_length(unit) <= 20),
  direction  text not null default 'higher' check (direction in ('higher','lower')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.performance_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  metric_id  uuid not null,
  logged_on  date not null,
  session_id uuid,
  attempts   int check (attempts between 1 and 5000),
  makes      int check (makes between 0 and 5000),
  value      numeric check (value between -100000 and 100000),
  notes      text check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  check (makes is null or (attempts is not null and makes <= attempts)),
  check (attempts is not null or value is not null),
  foreign key (metric_id, user_id)  references public.bball_metrics(id, user_id) on delete cascade,
  foreign key (session_id, user_id) references public.practice_sessions(id, user_id) on delete set null (session_id)
);
create index on public.performance_logs (user_id, logged_on);

-- ───────────────────────────── health ─────────────────────────────

create table public.workout_routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  weekdays    int[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7]),
  exercises   jsonb not null default '[]'::jsonb,        -- [{name, sets, reps, weight_kg?}]
  notes       text check (char_length(notes) <= 1000),
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);

create table public.workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workout_date  date not null,
  routine_id    uuid,
  name          text not null default 'Workout' check (char_length(btrim(name)) between 1 and 100),
  duration_min  int check (duration_min between 1 and 360),
  intensity     int check (intensity between 1 and 10),
  notes         text check (char_length(notes) <= 2000),
  created_at    timestamptz not null default now(),
  unique (id, user_id),
  foreign key (routine_id, user_id) references public.workout_routines(id, user_id) on delete set null (routine_id)
);
create index on public.workouts (user_id, workout_date);

create table public.workout_sets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workout_id uuid not null,
  exercise   text not null check (char_length(btrim(exercise)) between 1 and 80),
  set_no     int not null default 1 check (set_no between 1 and 50),
  reps       int not null check (reps between 0 and 500),
  weight_kg  numeric not null default 0 check (weight_kg between 0 and 1000),
  created_at timestamptz not null default now(),
  foreign key (workout_id, user_id) references public.workouts(id, user_id) on delete cascade
);
create index on public.workout_sets (user_id, workout_id);
create index on public.workout_sets (user_id, exercise);

create table public.body_metrics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  logged_on  date not null,
  kind       text not null check (char_length(btrim(kind)) between 1 and 40),     -- 'bodyweight' or a custom measurement (waist, chest…)
  value      numeric not null check (value > 0 and value < 1000),
  unit       text not null default 'kg' check (char_length(unit) <= 10),
  created_at timestamptz not null default now(),
  unique (user_id, logged_on, kind)
);
create index on public.body_metrics (user_id, kind, logged_on);

create table public.health_days (
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day           date not null,
  water_ml      int not null default 0 check (water_ml between 0 and 15000),
  sleep_hours   numeric(3,1) check (sleep_hours between 0 and 24),
  sleep_quality int check (sleep_quality between 1 and 5),
  mobility_min  int not null default 0 check (mobility_min between 0 and 600),
  is_rest_day   boolean not null default false,
  notes         text check (char_length(notes) <= 500),
  updated_at    timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.nutrition_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  logged_on  date not null,
  label      text not null default 'Meal' check (char_length(btrim(label)) between 1 and 80),
  protein_g  numeric not null default 0 check (protein_g between 0 and 500),
  calories   int check (calories between 0 and 10000),
  created_at timestamptz not null default now()
);
create index on public.nutrition_entries (user_id, logged_on);

-- ───────────────────────────── quests ─────────────────────────────

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title          text not null check (char_length(btrim(title)) between 1 and 160),
  description    text check (char_length(description) <= 2000),
  notes          text check (char_length(notes) <= 4000),
  category       text not null default 'life' references public.categories(key),
  subcategory    text check (char_length(subcategory) <= 40),
  difficulty     text not null default 'easy' check (difficulty in ('easy','medium','hard','boss')),
  quest_type     text not null default 'daily' check (quest_type in ('daily','weekly','boss','habit','recovery','challenge')),
  priority       int  not null default 2 check (priority between 1 and 3),
  est_minutes    int  check (est_minutes between 1 and 1440),
  actual_minutes int  check (actual_minutes between 0 and 100000),
  scheduled_date date,
  scheduled_time time,
  due_date       date,
  status         text not null default 'open' check (status in ('open','done','skipped','discarded','template')),
  sort_order     double precision not null default 0,
  recurrence     jsonb,                      -- templates only: {freq, interval, weekdays?, monthday?, until?, start}
  template_id    uuid,                       -- instance of a recurring template
  parent_id      uuid,                       -- sub-quest of a boss quest
  verify         jsonb,                      -- server-checked requirement, e.g. {"kind":"protein"}
  subject_id     uuid,
  project_id     uuid,
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  check ((status = 'template') = (recurrence is not null)),
  check (parent_id is null or parent_id <> id),
  foreign key (template_id, user_id) references public.tasks(id, user_id) on delete set null (template_id),
  foreign key (parent_id, user_id)   references public.tasks(id, user_id) on delete cascade,
  foreign key (subject_id, user_id)  references public.subjects(id, user_id) on delete set null (subject_id),
  foreign key (project_id, user_id)  references public.projects(id, user_id) on delete set null (project_id)
);
create unique index tasks_template_day on public.tasks (template_id, scheduled_date);
create index on public.tasks (user_id, status, scheduled_date);
create index on public.tasks (user_id, parent_id);

-- one row per completed quest instance; never written by clients
create table public.task_completions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  task_id        uuid not null unique,
  status         text not null default 'active' check (status in ('active','undone')),
  award_no       int  not null default 1,           -- bumps each time the quest is completed again after an undo
  category       text not null references public.categories(key),
  completed_at   timestamptz not null default now(),
  completed_on   date not null,                     -- user's LOCAL date at completion
  occurrence_date date,
  xp_awarded     int not null default 0,
  minutes_spent  int check (minutes_spent between 0 and 100000),
  undone_at      timestamptz,
  unique (id, user_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);
create index on public.task_completions (user_id, completed_on) where status = 'active';

-- append-only XP ledger. Totals and levels are derived from it.
create table public.xp_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  category      text not null references public.categories(key),
  amount        int  not null check (amount <> 0),
  kind          text not null check (kind in ('quest','bonus','reversal')),
  task_id       uuid,
  completion_id uuid,
  award_no      int,
  reverses_id   uuid references public.xp_transactions(id),
  note          text,
  local_date    date not null,
  created_at    timestamptz not null default now(),
  foreign key (task_id, user_id)       references public.tasks(id, user_id) on delete set null (task_id),
  foreign key (completion_id, user_id) references public.task_completions(id, user_id) on delete set null (completion_id),
  unique (reverses_id)
);
-- A completion can earn each kind of award at most once per award round: duplicate requests cannot double-pay.
create unique index xp_one_award_per_round on public.xp_transactions (completion_id, award_no, kind) where kind in ('quest','bonus');
create index on public.xp_transactions (user_id, created_at);
create index on public.xp_transactions (user_id, category);
create index on public.xp_transactions (user_id, local_date);

create table public.activity_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind       text not null check (kind in ('quest_done','level_up','achievement','reward')),
  category   text references public.categories(key),
  title      text not null,
  detail     jsonb not null default '{}'::jsonb,
  ref        text,
  created_at timestamptz not null default now()
);
create unique index activity_ref_unique on public.activity_events (user_id, kind, ref) where ref is not null;
create index on public.activity_events (user_id, created_at desc);

create table public.user_achievements (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  key         text not null references public.achievement_defs(key) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ───────────────────────────── planning, rewards, coach ─────────────────────────────

create table public.day_plans (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day         date not null,
  mvd         boolean not null default false,      -- Minimum Viable Day mode
  intention   text check (char_length(intention) <= 300),
  review      jsonb,                               -- {wins, friction, tomorrow}
  reviewed_at timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.rewards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title           text not null check (char_length(btrim(title)) between 1 and 100),
  note            text check (char_length(note) <= 300),
  unlock_kind     text not null check (unlock_kind in ('level','category_level','streak','achievement','xp')),
  unlock_category text references public.categories(key),
  unlock_key      text references public.achievement_defs(key),
  unlock_value    numeric check (unlock_value > 0),
  claimed_at      timestamptz,
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now(),
  check (unlock_kind <> 'category_level' or unlock_category is not null),
  check (unlock_kind <> 'achievement' or unlock_key is not null),
  check (unlock_kind = 'achievement' or unlock_value is not null)
);

create table public.coach_runs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  mode       text not null check (char_length(mode) <= 30),
  response   jsonb,
  created_at timestamptz not null default now()
);
create index on public.coach_runs (user_id, created_at desc);

-- ───────────────────────────── guards on tasks ─────────────────────────────
-- Status can flip to/from 'done' only inside complete_task() / undo_task() (they set app.task_transition).

create or replace function public.guard_task_changes() returns trigger
language plpgsql as $$
declare
  allowed boolean := coalesce(current_setting('app.task_transition', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status = 'done' and not allowed then
      raise exception 'Quests are completed with complete_task()' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if (old.status = 'done') is distinct from (new.status = 'done') and not allowed then
      raise exception 'Quests are completed or undone with complete_task() / undo_task()' using errcode = '42501';
    end if;
    if old.status = 'done' and not allowed
       and (new.difficulty is distinct from old.difficulty or new.category is distinct from old.category
            or new.verify is distinct from old.verify) then
      raise exception 'Undo the quest before changing its reward' using errcode = '42501';
    end if;
    return new;
  else
    if old.status = 'done' and not allowed then
      raise exception 'Undo a completed quest before deleting it' using errcode = '42501';
    end if;
    return old;
  end if;
end $$;

create trigger guard_task_changes before insert or update or delete on public.tasks
  for each row execute function public.guard_task_changes();

-- keep tasks.actual_minutes in step with logged focus sessions
create table public.focus_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  category        text not null check (category in ('college','dev','basketball','health','life')),
  session_date    date not null,                    -- user's local date
  started_at      timestamptz not null default now(),
  minutes         int not null check (minutes between 1 and 720),
  planned_minutes int check (planned_minutes between 1 and 720),
  mode            text not null default 'free' check (mode in ('pomodoro','free')),
  task_id         uuid,
  subject_id      uuid,
  project_id      uuid,
  track           text,
  note            text check (char_length(note) <= 300),
  created_at      timestamptz not null default now(),
  foreign key (task_id, user_id)    references public.tasks(id, user_id) on delete set null (task_id),
  foreign key (subject_id, user_id) references public.subjects(id, user_id) on delete set null (subject_id),
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete set null (project_id)
);
create index on public.focus_sessions (user_id, session_date);

create or replace function public.sync_task_minutes() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op in ('INSERT') and new.task_id is not null then
    update tasks set actual_minutes = coalesce(actual_minutes, 0) + new.minutes where id = new.task_id and user_id = new.user_id;
  elsif tg_op = 'DELETE' and old.task_id is not null then
    update tasks set actual_minutes = greatest(coalesce(actual_minutes, 0) - old.minutes, 0) where id = old.task_id and user_id = old.user_id;
  end if;
  return null;
end $$;
create trigger focus_sessions_minutes after insert or delete on public.focus_sessions
  for each row execute function public.sync_task_minutes();

-- ───────────────────────────── new-user bootstrap ─────────────────────────────

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────── updated_at triggers ─────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','subjects','syllabus_nodes','exams','projects','roadmap_items',
    'freelance_leads','income_records','drills','practice_plans','practice_sessions','workout_routines','tasks',
    'health_days','day_plans']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ───────────────────────────── row level security ─────────────────────────────

-- Fully user-owned tables: the owner can read and write their own rows only.
do $$
declare t text;
begin
  foreach t in array array['subjects','syllabus_nodes','exams','projects','roadmap_items','freelance_leads','outreach_log',
    'income_records','drills','practice_plans','practice_sessions','practice_drills','bball_metrics','performance_logs',
    'workout_routines','workouts','workout_sets','body_metrics','health_days','nutrition_entries','focus_sessions',
    'day_plans','rewards','coach_runs','user_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "own rows" on public.%I for all to authenticated
       using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- profiles: id is the user id; no client inserts (created by trigger / ensure_profile)
alter table public.profiles enable row level security;
create policy "read own profile"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- tasks: clients may create/edit/delete their own quests but never a 'done' one (the trigger enforces the rest)
alter table public.tasks enable row level security;
create policy "read own tasks"   on public.tasks for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own tasks" on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()) and status in ('open','skipped','discarded','template'));
create policy "update own tasks" on public.tasks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own tasks" on public.tasks for delete to authenticated using (user_id = (select auth.uid()));

-- trusted, server-written tables: read-only for clients
do $$
declare t text;
begin
  foreach t in array array['task_completions','xp_transactions','activity_events','user_achievements']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "read own" on public.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- reference data: readable by any signed-in user, writable by nobody
alter table public.categories        enable row level security;
alter table public.achievement_defs  enable row level security;
create policy "read categories"   on public.categories       for select to authenticated using (true);
create policy "read achievements" on public.achievement_defs for select to authenticated using (true);

-- ───────────────────────────── privileges ─────────────────────────────

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on public.categories, public.achievement_defs to authenticated;
grant select on public.task_completions, public.xp_transactions, public.activity_events, public.user_achievements to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.subjects, public.syllabus_nodes, public.exams, public.projects, public.roadmap_items, public.freelance_leads,
  public.outreach_log, public.income_records, public.drills, public.practice_plans, public.practice_sessions,
  public.practice_drills, public.bball_metrics, public.performance_logs, public.workout_routines, public.workouts,
  public.workout_sets, public.body_metrics, public.health_days, public.nutrition_entries, public.focus_sessions,
  public.day_plans, public.rewards, public.coach_runs, public.user_settings, public.tasks
  to authenticated;
-- users never need to write the settings row's identity or create/delete it
revoke insert, delete on public.user_settings from authenticated;
