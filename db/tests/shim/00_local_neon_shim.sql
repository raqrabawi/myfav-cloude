-- ============================================================================
-- LOCAL TEST SHIM ONLY — DO NOT APPLY TO A REAL NEON PROJECT.
--
-- Reproduces the parts of Neon (Managed Better Auth + Data API) that the MyFav
-- V2 migrations depend on, so they can be tested on a plain PostgreSQL:
--   * roles: authenticated, anonymous (what the Data API SET ROLEs to)
--   * neon_auth."user" (subset of columns, same names/types as Neon)
--   * auth.uid() (uuid) / auth.user_id() (text) / auth.jwt() reading the JWT
--     claims, like pg_session_jwt does for Data API requests.
-- Neon provisions all of this when Auth + Data API are enabled.
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anonymous') then
    create role anonymous nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists neon_auth;
create table if not exists neon_auth."user" (
  id uuid primary key,
  name text not null default '',
  email text not null,
  "emailVerified" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create schema if not exists auth;
-- Neon's auth.* functions are C functions (never inlined); SECURITY DEFINER
-- gives the same behaviour here.
-- Like Neon: the API roles may EXECUTE auth.* but have NO USAGE on schema auth,
-- so auth.uid() can only be reached through stored OIDs (policies, defaults,
-- SQL-standard bodies) or SECURITY DEFINER helpers — never by runtime name lookup.
revoke all on schema auth from public;

create or replace function auth.jwt() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.user_id() returns text language sql stable security definer set search_path = '' as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;
create or replace function auth.uid() returns uuid language sql stable security definer set search_path = '' as $$
  select auth.user_id()::uuid
$$;
grant execute on function auth.jwt(), auth.user_id(), auth.uid() to anonymous, authenticated;
grant usage on schema public to anonymous, authenticated;
