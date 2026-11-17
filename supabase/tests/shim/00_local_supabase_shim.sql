-- ============================================================================
-- LOCAL TEST SHIM ONLY — DO NOT APPLY TO A REAL SUPABASE PROJECT.
--
-- Reproduces the small part of Supabase's platform that MyFav V2 migrations
-- depend on, so migrations and RLS can be tested on a plain PostgreSQL 16:
--   * roles: anon, authenticated, service_role (NOLOGIN, like Supabase)
--   * schema auth with auth.users (subset of columns)
--   * auth.uid() / auth.role() / auth.jwt() reading request.jwt.claims,
--     exactly how PostgREST passes JWT claims to Postgres.
-- Real Supabase projects already provide all of this.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

-- Supabase grants USAGE on public to the API roles.
grant usage on schema public to anon, authenticated, service_role;
