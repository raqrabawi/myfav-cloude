-- ============================================================================
-- MyFav V2 — core schema, constraints, triggers and Row Level Security.
--
-- Identity authority: auth.users (Supabase Auth).
-- IDs: client-compatible text IDs (same format as the original app:
--      ^[A-Za-z0-9_-]{1,128}$), scoped per owner via composite primary keys
--      (owner_id, id) so one user can never collide with / probe another
--      user's IDs. "" (empty string) keeps its original meaning:
--      parent_id = '' -> root category; subcategory_id = '' -> no subcategory.
-- Hierarchy: exactly two levels (root -> subcategory), as in the original UI.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Helper functions (private schema is NOT exposed through the Data API)
-- ---------------------------------------------------------------------------

create or replace function private.is_clean_id(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and p ~ '^[A-Za-z0-9_-]{1,128}$'
$$;

create or replace function private.is_clean_icon(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and p ~ '^[A-Za-z0-9_-]{1,40}$'
$$;

-- Same semantics as the original server's cleanIcon()
create or replace function private.clean_icon(p text)
returns text language sql immutable set search_path = '' as $$
  select case when private.is_clean_icon(p) then p else 'bookmark' end
$$;

-- JavaScript String.prototype.trim() equivalent (strips all whitespace classes)
create or replace function private.js_trim(p text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(p, ''), '^[\s ﻿]+|[\s ﻿]+$', '', 'g')
$$;

create or replace function private.is_http_url(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and p ~* '^https?://[^\r\n]'
$$;

-- Same semantics as the original server's cleanUrl(): trim, max 500, http(s) only
create or replace function private.clean_url(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when private.is_http_url(left(private.js_trim(p), 500)) then left(private.js_trim(p), 500)
    else ''
  end
$$;

-- Unpredictable IDs (original used timestamp + Math.random); share IDs carry
-- 128 bits of randomness so public links cannot be enumerated.
create or replace function private.gen_id(p_prefix text)
returns text language sql volatile set search_path = '' as $$
  select left(p_prefix || '_' || replace(gen_random_uuid()::text, '-', ''), 64)
$$;

-- Caller must be signed in AND have a confirmed email address
-- (security_spec.md invariant 1: email_verified == true).
create or replace function private.is_verified()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
$$;
revoke all on function private.is_verified() from public;
grant execute on function private.is_verified() to authenticated;

create or replace function private.require_uid()
returns uuid language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_verified() then
    raise exception 'Email address is not verified' using errcode = '42501';
  end if;
  return v;
end $$;

grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.categories (
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id          text not null check (private.is_clean_id(id)),
  name        text not null check (char_length(name) between 1 and 80 and private.js_trim(name) <> ''),
  icon        text not null default 'bookmark' check (private.is_clean_icon(icon)),
  parent_id   text not null default '' check (parent_id = '' or private.is_clean_id(parent_id)),
  sort_order  integer not null default 0 check (sort_order between 0 and 100000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  seq         bigint generated always as identity,
  primary key (owner_id, id),
  check (parent_id <> id)
);
create index categories_owner_parent_idx on public.categories (owner_id, parent_id, sort_order);

create table public.bookmarks (
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id             text not null check (private.is_clean_id(id)),
  title          text not null check (char_length(title) between 1 and 120),
  url            text not null check (char_length(url) <= 500 and private.is_http_url(url)),
  description    text not null default '' check (char_length(description) <= 400),
  category_id    text not null check (private.is_clean_id(category_id)),
  subcategory_id text not null default '' check (subcategory_id = '' or private.is_clean_id(subcategory_id)),
  is_favorite    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  seq            bigint generated always as identity,
  primary key (owner_id, id),
  foreign key (owner_id, category_id) references public.categories (owner_id, id)
    on delete cascade deferrable initially deferred
);
create index bookmarks_owner_category_idx on public.bookmarks (owner_id, category_id);
create index bookmarks_owner_subcategory_idx on public.bookmarks (owner_id, subcategory_id) where subcategory_id <> '';
create index bookmarks_owner_url_idx on public.bookmarks (owner_id, lower(url));
create index bookmarks_owner_created_idx on public.bookmarks (owner_id, created_at, seq);

create table public.quick_shortcuts (
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id          text not null check (private.is_clean_id(id)),
  title       text not null check (char_length(title) between 1 and 80),
  url         text not null check (char_length(url) <= 500 and private.is_http_url(url)),
  icon_type   text not null default 'favicon' check (icon_type in ('favicon', 'lucide', 'custom')),
  custom_icon text not null default '' check (char_length(custom_icon) <= 500),
  sort_order  integer not null default 0 check (sort_order between 0 and 100000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  seq         bigint generated always as identity,
  primary key (owner_id, id),
  check (icon_type <> 'favicon' or custom_icon = '')
);
create index quick_shortcuts_owner_order_idx on public.quick_shortcuts (owner_id, sort_order, created_at);

create table public.user_settings (
  owner_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  theme_mode      text not null default 'dark' check (theme_mode in ('dark', 'light')),
  primary_color   text not null default 'blue' check (primary_color ~ '^[A-Za-z0-9#]{1,32}$'),
  glass_intensity text not null default 'balanced' check (glass_intensity in ('subtle', 'balanced', 'frosted')),
  card_density    text not null default 'comfortable' check (card_density in ('comfortable', 'compact')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Public share snapshot validation: whitelisted keys/types only, bounded size.
create or replace function private.is_valid_share_snapshot(p_subs jsonb, p_bms jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select
    jsonb_typeof(p_subs) = 'array' and jsonb_typeof(p_bms) = 'array'
    and jsonb_array_length(p_subs) <= 100
    and jsonb_array_length(p_bms) <= 500
    and octet_length(p_subs::text) + octet_length(p_bms::text) <= 600000
    and not exists (
      select 1 from jsonb_array_elements(p_subs) s
      where jsonb_typeof(s) <> 'object'
         or (select array_agg(k order by k) from jsonb_object_keys(s) k) <> array['icon','id','name','order']
         or not private.is_clean_id(s->>'id')
         or jsonb_typeof(s->'name') <> 'string' or char_length(s->>'name') > 80
         or not private.is_clean_icon(s->>'icon')
         or jsonb_typeof(s->'order') <> 'number'
    )
    and not exists (
      select 1 from jsonb_array_elements(p_bms) b
      where jsonb_typeof(b) <> 'object'
         or (select array_agg(k order by k) from jsonb_object_keys(b) k)
              <> array['description','isFavorite','subcategoryId','title','url']
         or jsonb_typeof(b->'title') <> 'string' or char_length(b->>'title') > 120
         or jsonb_typeof(b->'url') <> 'string' or char_length(b->>'url') > 500
         or not private.is_http_url(b->>'url')
         or jsonb_typeof(b->'description') <> 'string' or char_length(b->>'description') > 400
         or jsonb_typeof(b->'subcategoryId') <> 'string'
         or not (b->>'subcategoryId' = '' or private.is_clean_id(b->>'subcategoryId'))
         or jsonb_typeof(b->'isFavorite') <> 'boolean'
    )
$$;

create table public.shared_categories (
  id            text primary key check (private.is_clean_id(id)),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id   text not null check (private.is_clean_id(category_id)),
  category_name text not null check (char_length(category_name) between 1 and 80),
  category_icon text not null default 'bookmark' check (private.is_clean_icon(category_icon)),
  is_public     boolean not null default true,
  subcategories jsonb not null default '[]'::jsonb,
  bookmarks     jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (owner_id, category_id) references public.categories (owner_id, id)
    on delete cascade deferrable initially deferred,
  check (private.is_valid_share_snapshot(subcategories, bookmarks))
);
create index shared_categories_owner_idx on public.shared_categories (owner_id, category_id);

-- ---------------------------------------------------------------------------
-- Timestamp / immutability triggers
--   * created_at and updated_at are server-assigned on insert (forged client
--     timestamps are discarded — security_spec payload 8)
--   * owner_id, created_at and id are immutable on update (payloads 6, 7)
--   * updated_at is always server-maintained
-- ---------------------------------------------------------------------------

create or replace function private.tg_set_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    if new.owner_id is distinct from old.owner_id then
      raise exception 'owner_id is immutable' using errcode = '42501';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is immutable' using errcode = '42501';
    end if;
    if to_jsonb(new) ? 'id' and (to_jsonb(new)->>'id') is distinct from (to_jsonb(old)->>'id') then
      raise exception 'id is immutable' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger categories_timestamps before insert or update on public.categories
  for each row execute function private.tg_set_timestamps();
create trigger bookmarks_timestamps before insert or update on public.bookmarks
  for each row execute function private.tg_set_timestamps();
create trigger quick_shortcuts_timestamps before insert or update on public.quick_shortcuts
  for each row execute function private.tg_set_timestamps();
create trigger user_settings_timestamps before insert or update on public.user_settings
  for each row execute function private.tg_set_timestamps();
create trigger shared_categories_timestamps before insert or update on public.shared_categories
  for each row execute function private.tg_set_timestamps();

create or replace function private.tg_share_category_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category_id is distinct from old.category_id then
    raise exception 'category_id of a share is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger shared_categories_category_immutable before update on public.shared_categories
  for each row execute function private.tg_share_category_immutable();

-- ---------------------------------------------------------------------------
-- Relational consistency (security_spec invariant 2) — validated at COMMIT
-- (deferred constraint triggers) so that multi-step transactional operations
-- such as drag/drop tree moves can pass through intermediate states.
-- All lookups are owner-scoped, so cross-tenant references are impossible.
-- ---------------------------------------------------------------------------

create or replace function private.tg_validate_bookmark()
returns trigger language plpgsql set search_path = '' as $$
declare
  b public.bookmarks%rowtype;
  cat_parent text;
  sub_parent text;
begin
  select * into b from public.bookmarks where owner_id = new.owner_id and id = new.id;
  if not found then return null; end if;

  select parent_id into cat_parent from public.categories
    where owner_id = b.owner_id and id = b.category_id;
  if not found then
    raise exception 'Bookmark % references a missing category', b.id using errcode = '23503';
  end if;
  if cat_parent <> '' then
    raise exception 'Bookmark % must reference a root category', b.id using errcode = '23514';
  end if;

  if b.subcategory_id <> '' then
    select parent_id into sub_parent from public.categories
      where owner_id = b.owner_id and id = b.subcategory_id;
    if not found then
      raise exception 'Bookmark % references a missing subcategory', b.id using errcode = '23503';
    end if;
    if sub_parent <> b.category_id then
      raise exception 'Bookmark % subcategory does not belong to its category', b.id using errcode = '23514';
    end if;
  end if;
  return null;
end $$;

create constraint trigger bookmarks_relations
  after insert or update on public.bookmarks
  deferrable initially deferred
  for each row execute function private.tg_validate_bookmark();

create or replace function private.tg_validate_category()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_owner uuid := coalesce(new.owner_id, old.owner_id);
  v_id    text := coalesce(new.id, old.id);
  c public.categories%rowtype;
  parent_parent text;
  c_found boolean;
begin
  select * into c from public.categories where owner_id = v_owner and id = v_id;
  c_found := found;

  if c_found and c.parent_id <> '' then
    select parent_id into parent_parent from public.categories
      where owner_id = v_owner and id = c.parent_id;
    if not found then
      raise exception 'Subcategory % references a missing parent', v_id using errcode = '23503';
    end if;
    if parent_parent <> '' then
      raise exception 'Category hierarchy is limited to two levels (%).', v_id using errcode = '23514';
    end if;
    if exists (select 1 from public.bookmarks where owner_id = v_owner and category_id = v_id) then
      raise exception 'Bookmarks cannot use subcategory % as their root category', v_id using errcode = '23514';
    end if;
  end if;

  if exists (select 1 from public.categories
             where owner_id = v_owner and parent_id = v_id
               and (not c_found or c.parent_id <> '')) then
    raise exception 'Category % has children but is missing or not a root category', v_id using errcode = '23514';
  end if;

  if exists (select 1 from public.bookmarks
             where owner_id = v_owner and subcategory_id = v_id
               and (not c_found or c.parent_id <> category_id)) then
    raise exception 'Bookmarks reference subcategory % inconsistently', v_id using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger categories_relations
  after insert or update or delete on public.categories
  deferrable initially deferred
  for each row execute function private.tg_validate_category();

create or replace function private.tg_validate_share()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.categories
             where owner_id = new.owner_id and id = new.category_id and parent_id <> '') then
    raise exception 'Only root categories can be shared' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger shared_categories_relations
  after insert or update on public.shared_categories
  deferrable initially deferred
  for each row execute function private.tg_validate_share();

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-only access for verified users.
-- No anonymous access to any table. Public shares are readable ONLY through
-- public.get_public_share(share_id) (whitelisted fields, single id lookup).
-- ---------------------------------------------------------------------------

alter table public.categories        enable row level security;
alter table public.bookmarks         enable row level security;
alter table public.quick_shortcuts   enable row level security;
alter table public.user_settings     enable row level security;
alter table public.shared_categories enable row level security;


do $$
declare t text;
begin
  foreach t in array array['categories','bookmarks','quick_shortcuts','user_settings','shared_categories'] loop
    execute format($f$
      create policy %1$I on public.%2$I for select to authenticated
        using (owner_id = (select auth.uid()) and (select private.is_verified()))$f$, t || '_select_own', t);
    execute format($f$
      create policy %1$I on public.%2$I for insert to authenticated
        with check (owner_id = (select auth.uid()) and (select private.is_verified()))$f$, t || '_insert_own', t);
    execute format($f$
      create policy %1$I on public.%2$I for update to authenticated
        using (owner_id = (select auth.uid()) and (select private.is_verified()))
        with check (owner_id = (select auth.uid()) and (select private.is_verified()))$f$, t || '_update_own', t);
    execute format($f$
      create policy %1$I on public.%2$I for delete to authenticated
        using (owner_id = (select auth.uid()) and (select private.is_verified()))$f$, t || '_delete_own', t);
  end loop;
end $$;

revoke all on public.categories, public.bookmarks, public.quick_shortcuts,
              public.user_settings, public.shared_categories from anon, public;
grant select, insert, update, delete on public.categories, public.bookmarks,
      public.quick_shortcuts, public.user_settings, public.shared_categories to authenticated;
-- Note: seq columns are GENERATED ALWAYS identities; explicit writes are rejected by Postgres.
