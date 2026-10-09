// What Supabase normally provides underneath the schema: the anon/authenticated roles and auth.uid().
// Idempotent. Everything else comes from supabase/migrations/*.sql, unchanged.
export const BOOTSTRAP_SQL = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid(), auth.role() to anon, authenticated;
create schema if not exists _lu;
create table if not exists _lu.migrations (name text primary key, applied_at timestamptz not null default now());
`;

/** The one and only user of an on-device install. A fixed id keeps backups portable between devices. */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
export const IDB_NAME = "idb://level-up";
export const LOCK_NAME = "level-up-database";
