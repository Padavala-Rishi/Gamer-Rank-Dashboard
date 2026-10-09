-- Level Up — trusted server-side logic
--
-- Everything that moves XP lives here. Clients call these functions with a quest id; they never send an
-- XP amount. Functions read the caller from auth.uid(), lock the quest row, and rely on unique
-- constraints (see xp_one_award_per_round) so duplicate or concurrent requests cannot double-pay.
-- Functions named _xxx are internal helpers: not executable by API roles.

-- ───────────────────────────── level curve ─────────────────────────────
-- XP needed to REACH level L: round(base * (L-1) ^ exponent). Level 1 starts at 0 XP.
-- floor(x + 0.5) instead of round() so SQL and TypeScript agree exactly on .5 ties.

create or replace function public.xp_to_reach(lvl int, base numeric, expo numeric) returns bigint
language sql immutable as $$
  select case when lvl <= 1 then 0::bigint
    else floor(base::double precision * power((lvl - 1)::double precision, expo::double precision) + 0.5)::bigint end
$$;

create or replace function public.level_for_xp(xp bigint, base numeric, expo numeric) returns int
language plpgsql immutable as $$
declare l int;
begin
  if xp is null or xp <= 0 then return 1; end if;
  l := greatest(1, floor(power(xp::double precision / base::double precision, 1.0 / expo::double precision))::int + 1);
  l := least(l, 999);
  while l < 999 and public.xp_to_reach(l + 1, base, expo) <= xp loop l := l + 1; end loop;
  while l > 1 and public.xp_to_reach(l, base, expo) > xp loop l := l - 1; end loop;
  return l;
end $$;

-- ───────────────────────────── streak helpers ─────────────────────────────
-- A day is ACTIVE if at least one quest was completed that (local) day.
-- A planned rest day (marked in Health, or a configured rest weekday) neither adds to nor breaks a streak.

create or replace function public._is_rest_day(d date, rest date[], wd int[]) returns boolean
language sql immutable as $$
  select (rest is not null and d = any(rest)) or extract(isodow from d)::int = any(coalesce(wd, '{}'::int[]))
$$;

create or replace function public._streaks(uid uuid, out cur int, out best int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  tz text; today date; first_d date; d date; run int := 0;
  active date[]; rest date[]; wd int[];
begin
  select timezone into tz from profiles where id = uid;
  today := (now() at time zone coalesce(tz, 'UTC'))::date;
  select array_agg(distinct completed_on) into active from task_completions where user_id = uid and status = 'active';
  cur := 0; best := 0;
  if active is null then return; end if;
  select rest_weekdays into wd from user_settings where user_id = uid;
  select array_agg(day) into rest from health_days where user_id = uid and is_rest_day;
  select min(x) into first_d from unnest(active) x;

  d := first_d;
  while d <= today loop
    if d = any(active) then run := run + 1; best := greatest(best, run);
    elsif public._is_rest_day(d, rest, wd) then null;
    else run := 0; end if;
    d := d + 1;
  end loop;

  d := today;   -- today may still be open: the streak is "at risk", not broken
  if not (d = any(active)) and not public._is_rest_day(d, rest, wd) then d := d - 1; end if;
  while d >= first_d loop
    if d = any(active) then cur := cur + 1;
    elsif public._is_rest_day(d, rest, wd) then null;
    else exit; end if;
    d := d - 1;
  end loop;
end $$;

-- ───────────────────────────── metrics & achievements ─────────────────────────────

create or replace function public._user_metrics(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s user_settings%rowtype; m jsonb; tot bigint; r record; st record; tg jsonb;
begin
  select * into s from user_settings where user_id = uid;
  tg := s.targets;
  select coalesce(sum(amount), 0) into tot from xp_transactions where user_id = uid;
  m := jsonb_build_object('xp_total', tot, 'level', public.level_for_xp(tot, s.level_base, s.level_exponent));
  for r in
    select c.key, coalesce(sum(x.amount), 0)::bigint as xp
    from categories c left join xp_transactions x on x.category = c.key and x.user_id = uid
    where c.key <> 'life' group by c.key
  loop
    m := m || jsonb_build_object('cat_level_' || r.key, public.level_for_xp(r.xp, s.category_level_base, s.level_exponent));
  end loop;
  select * into st from public._streaks(uid);
  m := m || jsonb_build_object('current_streak', st.cur, 'best_streak', st.best);
  m := m || jsonb_build_object(
    'quests_done',  (select count(*) from task_completions where user_id = uid and status = 'active'),
    'boss_done',    (select count(*) from task_completions c join tasks t on t.id = c.task_id
                      where c.user_id = uid and c.status = 'active' and t.difficulty = 'boss'),
    'active_days',  (select count(distinct completed_on) from task_completions where user_id = uid and status = 'active'),
    'rest_days',    (select count(*) from health_days where user_id = uid and is_rest_day),
    'practice_sessions', (select count(*) from practice_sessions where user_id = uid and status = 'done'),
    'practice_minutes',  (select coalesce(sum(duration_min), 0) from practice_sessions where user_id = uid and status = 'done'),
    'shots_logged',      (select coalesce(sum(p.attempts), 0) from performance_logs p join bball_metrics b on b.id = p.metric_id
                           where p.user_id = uid and b.kind = 'shooting'),
    'shooting_best_pct', (select coalesce(max(100.0 * mk / at), 0) from (
                            select sum(p.makes) mk, sum(p.attempts) at from performance_logs p
                            join bball_metrics b on b.id = p.metric_id
                            where p.user_id = uid and b.kind = 'shooting' and p.attempts is not null
                            group by p.logged_on, p.metric_id having sum(p.attempts) >= 20) q),
    'focus_minutes_college', (select coalesce(sum(minutes), 0) from focus_sessions where user_id = uid and category = 'college'),
    'syllabus_done',  (select count(*) from syllabus_nodes where user_id = uid and status = 'done'),
    'revisions',      (select coalesce(sum(revision_count), 0) from syllabus_nodes where user_id = uid),
    'exams_taken',    (select count(*) from exams where user_id = uid and status = 'taken'),
    'focus_minutes_dev', (select coalesce(sum(minutes), 0) from focus_sessions where user_id = uid and category = 'dev'),
    'roadmap_done',   (select count(*) from roadmap_items where user_id = uid and status = 'done'),
    'projects_deployed',  (select count(*) from projects where user_id = uid and stage in ('deployed','completed')),
    'projects_completed', (select count(*) from projects where user_id = uid and stage = 'completed'),
    'outreach_count', (select count(*) from outreach_log where user_id = uid and kind in ('message','followup','proposal')),
    'leads_won',      (select count(*) from freelance_leads where user_id = uid and status = 'won'),
    'income_received_inr', (select coalesce(sum(amount), 0) from income_records where user_id = uid and kind = 'payment' and currency = 'INR'),
    'workouts',       (select count(*) from workouts where user_id = uid),
    'sets_logged',    (select count(*) from workout_sets where user_id = uid),
    'bodyweight_logs',(select count(*) from body_metrics where user_id = uid and kind = 'bodyweight'),
    'protein_days',   (select count(*) from (select 1 from nutrition_entries where user_id = uid group by logged_on
                        having sum(protein_g) >= coalesce((tg->>'protein_g')::numeric, 1e9)) q),
    'water_days',     (select count(*) from health_days where user_id = uid and water_ml >= coalesce((tg->>'water_ml')::int, 1000000)),
    'sleep_days',     (select count(*) from health_days where user_id = uid
                        and sleep_hours between coalesce((tg->>'sleep_min_h')::numeric, 99) and coalesce((tg->>'sleep_max_h')::numeric, 0))
  );
  return m;
end $$;

create or replace function public._evaluate_achievements(uid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m jsonb := public._user_metrics(uid); r record; out jsonb := '[]'::jsonb; ins int;
begin
  for r in
    select d.* from achievement_defs d
    where coalesce((m->>d.metric)::numeric, 0) >= d.threshold
      and not exists (select 1 from user_achievements ua where ua.user_id = uid and ua.key = d.key)
    order by d.sort
  loop
    insert into user_achievements (user_id, key) values (uid, r.key) on conflict do nothing;
    get diagnostics ins = row_count;
    if ins > 0 then
      insert into activity_events (user_id, kind, category, title, detail, ref)
      values (uid, 'achievement', r.category, r.name, jsonb_build_object('key', r.key, 'title', r.title, 'icon', r.icon), r.key)
      on conflict do nothing;
      out := out || jsonb_build_array(jsonb_build_object('key', r.key, 'name', r.name, 'icon', r.icon, 'title', r.title, 'description', r.description));
    end if;
  end loop;
  return out;
end $$;

-- Undoing work (or removing sample data) can drop a metric below a threshold; badges earned from work that no
-- longer counts are withdrawn so progress stays consistent with the ledger.
create or replace function public._reconcile_achievements(uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m jsonb := public._user_metrics(uid); r record;
begin
  for r in
    select ua.key, d.title from user_achievements ua join achievement_defs d on d.key = ua.key
    where ua.user_id = uid and coalesce((m->>d.metric)::numeric, 0) < d.threshold
  loop
    delete from user_achievements where user_id = uid and key = r.key;
    delete from activity_events where user_id = uid and kind = 'achievement' and ref = r.key;
    if r.title is not null then
      update profiles set active_title = null where id = uid and active_title = r.title;
    end if;
  end loop;
end $$;

-- ───────────────────────────── requirement checks ─────────────────────────────
-- Quests created from "auto" templates carry a verify rule. The server checks that the matching record exists
-- before paying XP. (It can verify that something was logged, not that it really happened.)

create or replace function public._check_requirement(uid uuid, v jsonb, d date) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  kind text := v->>'kind'; tg jsonb; h health_days%rowtype; n numeric; need numeric;
  lo numeric; hi numeric;
begin
  select targets into tg from user_settings where user_id = uid;
  select * into h from health_days where user_id = uid and day = d;
  if kind = 'protein' then
    select coalesce(sum(protein_g), 0) into n from nutrition_entries where user_id = uid and logged_on = d;
    need := (tg->>'protein_g')::numeric;
    if n < need then return format('Log at least %s g of protein first (logged: %s g).', need, n); end if;
  elsif kind = 'water' then
    need := (tg->>'water_ml')::numeric;
    if coalesce(h.water_ml, 0) < need then return format('Log %s ml of water first (logged: %s ml).', need, coalesce(h.water_ml, 0)); end if;
  elsif kind = 'sleep' then
    lo := (tg->>'sleep_min_h')::numeric; hi := (tg->>'sleep_max_h')::numeric;
    if h.sleep_hours is null then return 'Log your sleep first.'; end if;
    if h.sleep_hours < lo or h.sleep_hours > hi then
      return format('Adequate sleep is %s–%s h (logged: %s h). Sleeping less is not rewarded.', lo, hi, h.sleep_hours);
    end if;
  elsif kind = 'mobility' then
    need := coalesce((v->>'minutes')::numeric, (tg->>'mobility_min')::numeric);
    if coalesce(h.mobility_min, 0) < need then return format('Log %s minutes of mobility first (logged: %s).', need, coalesce(h.mobility_min, 0)); end if;
  elsif kind = 'bodyweight' then
    if not exists (select 1 from body_metrics where user_id = uid and logged_on = d and kind = 'bodyweight') then
      return 'Log your bodyweight first.';
    end if;
  elsif kind = 'workout' then
    if not exists (select 1 from workouts where user_id = uid and workout_date = d) then return 'Log a workout first.'; end if;
  elsif kind = 'rest' then
    if not coalesce(h.is_rest_day, false) then return 'Mark today as a rest day in Health first.'; end if;
  elsif kind = 'practice' then
    if not exists (select 1 from practice_sessions where user_id = uid and session_date = d and status = 'done') then
      return 'Log a finished practice session first.';
    end if;
  elsif kind = 'focus' then
    need := coalesce((v->>'minutes')::numeric, 25);
    select coalesce(sum(minutes), 0) into n from focus_sessions
      where user_id = uid and session_date = d and category = coalesce(v->>'category', category);
    if n < need then return format('Log %s focused minutes first (logged: %s).', need, n); end if;
  elsif kind = 'shooting' then
    need := coalesce((v->>'attempts')::numeric, 20);
    select coalesce(sum(p.attempts), 0) into n from performance_logs p join bball_metrics b on b.id = p.metric_id
      where p.user_id = uid and p.logged_on = d and b.kind = 'shooting';
    if n < need then return format('Log %s shot attempts first (logged: %s).', need, n); end if;
  else
    return 'Unknown requirement.';
  end if;
  return null;
end $$;

-- ───────────────────────────── complete / undo ─────────────────────────────

create or replace function public._reverse_completion(uid uuid, comp_id uuid, why text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare c task_completions%rowtype; r record; removed int := 0; ldate date; tz text;
begin
  select * into c from task_completions where id = comp_id and user_id = uid for update;
  if not found or c.status <> 'active' then return 0; end if;
  select timezone into tz from profiles where id = uid;
  ldate := (now() at time zone coalesce(tz, 'UTC'))::date;
  for r in select * from xp_transactions
           where completion_id = c.id and award_no = c.award_no and kind in ('quest','bonus') and user_id = uid
             and not exists (select 1 from xp_transactions x where x.reverses_id = xp_transactions.id)
  loop
    insert into xp_transactions (user_id, category, amount, kind, task_id, completion_id, award_no, reverses_id, note, local_date)
    values (uid, r.category, -r.amount, 'reversal', r.task_id, c.id, c.award_no, r.id, why, ldate);
    removed := removed + r.amount;
  end loop;
  update task_completions set status = 'undone', undone_at = now(), xp_awarded = 0 where id = c.id;
  delete from activity_events where user_id = uid and kind = 'quest_done' and ref = c.id::text || ':' || c.award_no::text;
  return removed;
end $$;

create or replace function public.complete_task(p_task_id uuid, p_minutes int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  t tasks%rowtype; s user_settings%rowtype; tz text; today date; vdate date; err text;
  comp task_completions%rowtype;
  base int; bonus int := 0; focus_min int; gained int;
  all_before bigint; all_after bigint; cat_before bigint; cat_after bigint;
  lvl_all_b int; lvl_all_a int; lvl_cat_b int; lvl_cat_a int;
  ups jsonb := '[]'::jsonb; lv int; ins int; newly jsonb;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;

  select * into t from tasks where id = p_task_id and user_id = uid for update;
  if not found then raise exception 'Quest not found' using errcode = 'P0002'; end if;
  select * into s from user_settings where user_id = uid;
  select timezone into tz from profiles where id = uid;
  today := (now() at time zone coalesce(tz, 'UTC'))::date;

  if t.status = 'done' then
    return jsonb_build_object('already_done', true, 'xp', 0, 'level_ups', '[]'::jsonb, 'achievements', '[]'::jsonb);
  end if;
  if t.status = 'template' then raise exception 'Complete a dated occurrence, not the repeating template' using errcode = 'LV003'; end if;
  if t.status <> 'open' then raise exception 'Only open quests can be completed' using errcode = 'LV003'; end if;
  if t.scheduled_date is not null and t.scheduled_date > today then
    raise exception 'This quest is scheduled for % — you can complete it on the day.', t.scheduled_date using errcode = 'LV004';
  end if;
  if exists (select 1 from tasks c where c.parent_id = t.id and c.user_id = uid and c.status = 'open') then
    raise exception 'Finish (or discard) the sub-quests first.' using errcode = 'LV002';
  end if;
  if t.verify is not null then
    vdate := case when t.scheduled_date is not null and t.scheduled_date <= today then t.scheduled_date else today end;
    err := public._check_requirement(uid, t.verify, vdate);
    if err is not null then raise exception '%', err using errcode = 'LV001'; end if;
  end if;

  base := coalesce((s.xp_values->>t.difficulty)::int, case t.difficulty when 'easy' then 10 when 'medium' then 25 when 'hard' then 50 else 100 end);
  -- Focused-work bonus: the quest had a planned length and you actually logged most of it against this quest.
  if t.est_minutes is not null and t.est_minutes >= 20 then
    select coalesce(sum(minutes), 0) into focus_min from focus_sessions where task_id = t.id and user_id = uid;
    if focus_min >= 0.8 * t.est_minutes then bonus := floor(base * 0.25); end if;
  end if;
  gained := base + bonus;

  select coalesce(sum(amount), 0) into all_before from xp_transactions where user_id = uid;
  select coalesce(sum(amount), 0) into cat_before from xp_transactions where user_id = uid and category = t.category;

  perform set_config('app.task_transition', 'on', true);
  insert into task_completions (user_id, task_id, status, category, completed_on, occurrence_date, xp_awarded, minutes_spent, award_no)
  values (uid, t.id, 'active', t.category, today, t.scheduled_date, gained, p_minutes, 1)
  on conflict (task_id) do update set
    status = 'active', completed_at = now(), completed_on = excluded.completed_on, undone_at = null,
    xp_awarded = excluded.xp_awarded, minutes_spent = excluded.minutes_spent,
    award_no = task_completions.award_no + 1
  returning * into comp;

  insert into xp_transactions (user_id, category, amount, kind, task_id, completion_id, award_no, note, local_date)
  values (uid, t.category, base, 'quest', t.id, comp.id, comp.award_no, t.title, today);
  if bonus > 0 then
    insert into xp_transactions (user_id, category, amount, kind, task_id, completion_id, award_no, note, local_date)
    values (uid, t.category, bonus, 'bonus', t.id, comp.id, comp.award_no, 'Focused-work bonus', today);
  end if;

  update tasks set status = 'done', actual_minutes = coalesce(p_minutes, actual_minutes) where id = t.id;
  perform set_config('app.task_transition', 'off', true);

  all_after := all_before + gained;
  cat_after := cat_before + gained;
  lvl_all_b := public.level_for_xp(all_before, s.level_base, s.level_exponent);
  lvl_all_a := public.level_for_xp(all_after,  s.level_base, s.level_exponent);
  lvl_cat_b := public.level_for_xp(cat_before, s.category_level_base, s.level_exponent);
  lvl_cat_a := public.level_for_xp(cat_after,  s.category_level_base, s.level_exponent);

  insert into activity_events (user_id, kind, category, title, detail, ref)
  values (uid, 'quest_done', t.category, t.title, jsonb_build_object('xp', gained, 'difficulty', t.difficulty), comp.id::text || ':' || comp.award_no::text)
  on conflict do nothing;

  -- A level-up is recorded (and celebrated) once per level, even if the quest is undone and redone.
  for lv in lvl_all_b + 1 .. lvl_all_a loop
    insert into activity_events (user_id, kind, category, title, detail, ref)
    values (uid, 'level_up', null, 'Reached level ' || lv, jsonb_build_object('level', lv, 'scope', 'overall'), 'overall:' || lv)
    on conflict do nothing;
    get diagnostics ins = row_count;
    if ins > 0 then ups := ups || jsonb_build_array(jsonb_build_object('scope', 'overall', 'level', lv)); end if;
  end loop;
  if t.category <> 'life' then
    for lv in lvl_cat_b + 1 .. lvl_cat_a loop
      insert into activity_events (user_id, kind, category, title, detail, ref)
      values (uid, 'level_up', t.category, (select name from categories where key = t.category) || ' level ' || lv,
              jsonb_build_object('level', lv, 'scope', t.category), t.category || ':' || lv)
      on conflict do nothing;
      get diagnostics ins = row_count;
      if ins > 0 then ups := ups || jsonb_build_array(jsonb_build_object('scope', t.category, 'level', lv)); end if;
    end loop;
  end if;

  newly := public._evaluate_achievements(uid);

  return jsonb_build_object(
    'already_done', false, 'xp', gained, 'base', base, 'bonus', bonus, 'category', t.category,
    'total_xp', all_after, 'category_xp', cat_after,
    'level_before', lvl_all_b, 'level_after', lvl_all_a,
    'category_level_before', lvl_cat_b, 'category_level_after', lvl_cat_a,
    'level_ups', ups, 'achievements', newly);
end $$;

create or replace function public.undo_task(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); t tasks%rowtype; comp task_completions%rowtype; removed int; total bigint;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into t from tasks where id = p_task_id and user_id = uid for update;
  if not found then raise exception 'Quest not found' using errcode = 'P0002'; end if;
  if t.status <> 'done' then
    return jsonb_build_object('undone', false, 'xp_removed', 0);
  end if;
  select * into comp from task_completions where task_id = t.id and user_id = uid and status = 'active' for update;
  perform set_config('app.task_transition', 'on', true);
  removed := public._reverse_completion(uid, comp.id, 'Undo: ' || t.title);
  update tasks set status = 'open' where id = t.id;
  perform set_config('app.task_transition', 'off', true);
  perform public._reconcile_achievements(uid);
  select coalesce(sum(amount), 0) into total from xp_transactions where user_id = uid;
  return jsonb_build_object('undone', true, 'xp_removed', removed, 'total_xp', total);
end $$;

-- ───────────────────────────── read helpers for the UI ─────────────────────────────

create or replace function public.progress_summary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); cats jsonb := '{}'::jsonb; r record; st record;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  for r in select category, sum(amount)::bigint as xp from xp_transactions where user_id = uid group by category loop
    cats := cats || jsonb_build_object(r.category, r.xp);
  end loop;
  select * into st from public._streaks(uid);
  return jsonb_build_object('xp_by_category', cats, 'current_streak', st.cur, 'best_streak', st.best, 'metrics', public._user_metrics(uid));
end $$;

create or replace function public.daily_xp(p_from date, p_to date)
returns table (day date, category text, xp int)
language sql stable security invoker set search_path = public, pg_temp as $$
  select local_date, category, sum(amount)::int
  from xp_transactions
  where user_id = auth.uid() and local_date between p_from and p_to
  group by local_date, category order by local_date
$$;

-- ───────────────────────────── account helpers ─────────────────────────────

create or replace function public.ensure_profile() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  insert into profiles (id) values (uid) on conflict do nothing;
  insert into user_settings (user_id) values (uid) on conflict do nothing;
end $$;

create or replace function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if new.timezone is distinct from old.timezone
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  if new.active_title is distinct from old.active_title and new.active_title is not null and new.active_title <> 'Rookie'
     and not exists (select 1 from user_achievements ua join achievement_defs d on d.key = ua.key
                     where ua.user_id = new.id and d.title = new.active_title) then
    raise exception 'That title has not been unlocked' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

create or replace function public.claim_reward(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); r rewards%rowtype; m jsonb; s user_settings%rowtype; have numeric; ok boolean;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into r from rewards where id = p_id and user_id = uid for update;
  if not found then raise exception 'Reward not found' using errcode = 'P0002'; end if;
  if r.claimed_at is not null then return jsonb_build_object('claimed', true, 'already', true); end if;
  m := public._user_metrics(uid);
  if r.unlock_kind = 'level' then have := (m->>'level')::numeric; ok := have >= r.unlock_value;
  elsif r.unlock_kind = 'category_level' then have := coalesce((m->>('cat_level_' || r.unlock_category))::numeric, 0); ok := have >= r.unlock_value;
  elsif r.unlock_kind = 'streak' then have := (m->>'best_streak')::numeric; ok := have >= r.unlock_value;
  elsif r.unlock_kind = 'xp' then have := (m->>'xp_total')::numeric; ok := have >= r.unlock_value;
  else ok := exists (select 1 from user_achievements where user_id = uid and key = r.unlock_key); have := 0; end if;
  if not ok then raise exception 'Not unlocked yet — keep going.' using errcode = 'LV005'; end if;
  perform set_config('app.reward_claim', 'on', true);
  update rewards set claimed_at = now() where id = r.id;
  perform set_config('app.reward_claim', 'off', true);
  insert into activity_events (user_id, kind, title, detail, ref)
  values (uid, 'reward', 'Claimed: ' || r.title, '{}'::jsonb, r.id::text) on conflict do nothing;
  return jsonb_build_object('claimed', true, 'already', false);
end $$;

-- claimed_at can only be set by claim_reward(), which checks the milestone
create or replace function public.guard_reward() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.reward_claim', true), '') <> 'on' then
    if tg_op = 'INSERT' and new.claimed_at is not null then
      raise exception 'Rewards are claimed with claim_reward()' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.claimed_at is distinct from old.claimed_at then
      raise exception 'Rewards are claimed with claim_reward()' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger guard_reward before insert or update on public.rewards for each row execute function public.guard_reward();

-- Remove the example data (and any XP it earned) without touching real progress.
create or replace function public.remove_sample_data() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); r record; removed int := 0; n int := 0;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  perform set_config('app.task_transition', 'on', true);
  for r in select c.id from task_completions c join tasks t on t.id = c.task_id
           where c.user_id = uid and c.status = 'active' and t.is_sample loop
    removed := removed + public._reverse_completion(uid, r.id, 'Sample data removed');
  end loop;
  delete from tasks where user_id = uid and is_sample;
  get diagnostics n = row_count;
  delete from subjects where user_id = uid and is_sample;
  delete from exams where user_id = uid and is_sample;
  delete from projects where user_id = uid and is_sample;
  delete from roadmap_items where user_id = uid and is_sample;
  delete from freelance_leads where user_id = uid and is_sample;
  delete from drills where user_id = uid and is_sample;
  delete from practice_plans where user_id = uid and is_sample;
  delete from workout_routines where user_id = uid and is_sample;
  delete from rewards where user_id = uid and is_sample;
  perform set_config('app.task_transition', 'off', true);
  perform public._reconcile_achievements(uid);
  return jsonb_build_object('quests_removed', n, 'xp_removed', removed);
end $$;

-- Wipe all of the caller's data (settings and profile are kept).
create or replace function public.reset_my_data() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  perform set_config('app.task_transition', 'on', true);
  delete from activity_events where user_id = uid;
  delete from user_achievements where user_id = uid;
  delete from xp_transactions where user_id = uid;
  delete from task_completions where user_id = uid;
  delete from focus_sessions where user_id = uid;
  delete from tasks where user_id = uid;
  delete from rewards where user_id = uid;
  delete from coach_runs where user_id = uid;
  delete from day_plans where user_id = uid;
  delete from income_records where user_id = uid and kind = 'payment';
  delete from income_records where user_id = uid;
  delete from outreach_log where user_id = uid;
  delete from freelance_leads where user_id = uid;
  delete from projects where user_id = uid;
  delete from roadmap_items where user_id = uid;
  delete from performance_logs where user_id = uid;
  delete from bball_metrics where user_id = uid;
  delete from practice_sessions where user_id = uid;
  delete from practice_plans where user_id = uid;
  delete from drills where user_id = uid;
  delete from workouts where user_id = uid;
  delete from workout_routines where user_id = uid;
  delete from body_metrics where user_id = uid;
  delete from health_days where user_id = uid;
  delete from nutrition_entries where user_id = uid;
  delete from subjects where user_id = uid;
  delete from exams where user_id = uid;
  update profiles set active_title = null where id = uid;
  perform set_config('app.task_transition', 'off', true);
end $$;

-- ───────────────────────────── privileges ─────────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;

-- CHECK constraints run as the calling role, so the validator must stay executable.
grant execute on function public.valid_xp_values(jsonb) to authenticated;
grant execute on function public.xp_to_reach(int, numeric, numeric) to authenticated;
grant execute on function public.level_for_xp(bigint, numeric, numeric) to authenticated;
grant execute on function public.complete_task(uuid, int) to authenticated;
grant execute on function public.undo_task(uuid) to authenticated;
grant execute on function public.progress_summary() to authenticated;
grant execute on function public.daily_xp(date, date) to authenticated;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.claim_reward(uuid) to authenticated;
grant execute on function public.remove_sample_data() to authenticated;
grant execute on function public.reset_my_data() to authenticated;
