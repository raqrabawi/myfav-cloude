-- ============================================================================
-- MyFav V2 — transactional RPCs (called through the Neon Data API: client.rpc()).
--
-- Every function below is SECURITY INVOKER (runs as the calling
-- `authenticated` user, so RLS applies to every statement), pins
-- search_path = '', resolves the owner from auth.uid() (never from client
-- input) and runs inside a single transaction (all-or-nothing).
-- Multi-record operations take a per-user advisory lock so concurrent
-- imports / syncs from several tabs cannot interleave.
--
-- Semantics are ported 1:1 from the original server (src/db/workspace.ts).
-- The only deliberate deviations strengthen integrity and are documented in
-- SECURITY_REPORT.md.
-- ============================================================================

create or replace function private.lock_owner(p_uid uuid)
returns void language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('myfav:' || p_uid::text, 0))
$$;
grant execute on function private.lock_owner(uuid) to authenticated;

create or replace function private.clamp_order(p numeric)
returns integer language sql immutable set search_path = '' as $$
  select least(100000, greatest(0, coalesce(trunc(p), 0)))::integer
$$;
grant execute on function private.clamp_order(numeric) to authenticated;

create or replace function private.safe_numeric(p jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric else 0 end
$$;
grant execute on function private.safe_numeric(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Workspace: clear (original DELETE /api/workspace)
-- ---------------------------------------------------------------------------
create or replace function public.myfav_clear_workspace()
returns void language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := private.require_uid();
begin
  perform private.lock_owner(v_uid);
  delete from public.shared_categories where owner_id = v_uid;
  delete from public.quick_shortcuts   where owner_id = v_uid;
  delete from public.bookmarks         where owner_id = v_uid;
  delete from public.categories        where owner_id = v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- Workspace: merge guest/local data into cloud (POST /api/workspace/sync-local)
-- ---------------------------------------------------------------------------
create or replace function public.myfav_sync_local_workspace(p_payload jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  cat_map jsonb := '{}'::jsonb;          -- local id -> cloud id
  root_ids jsonb := '{}'::jsonb;         -- set of cloud root ids
  sub_parent jsonb := '{}'::jsonb;       -- cloud sub id -> cloud parent id
  roots_by_name jsonb := '{}'::jsonb;    -- lower(name) -> id
  subs_by_key jsonb := '{}'::jsonb;      -- parent::lower(name) -> id
  used_ids jsonb := '{}'::jsonb;         -- all category ids in use
  next_root_order integer;
  r record;
  v_name text; v_id text; v_parent text; v_match text;
begin
  perform private.lock_owner(v_uid);
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;

  for r in select id, name, parent_id from public.categories where owner_id = v_uid loop
    used_ids := used_ids || jsonb_build_object(r.id, true);
    if r.parent_id = '' then
      roots_by_name := roots_by_name || jsonb_build_object(lower(private.js_trim(r.name)), r.id);
      root_ids := root_ids || jsonb_build_object(r.id, true);
    else
      subs_by_key := subs_by_key || jsonb_build_object(r.parent_id || '::' || lower(private.js_trim(r.name)), r.id);
      sub_parent := sub_parent || jsonb_build_object(r.id, r.parent_id);
    end if;
  end loop;

  select count(*) into next_root_order from public.categories where owner_id = v_uid and parent_id = '';

  -- Roots, in local order
  for r in
    select e, ord from jsonb_array_elements(
      case when jsonb_typeof(p_payload->'categories') = 'array' then p_payload->'categories' else '[]' end
    ) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'object' and coalesce(e->>'parentId', '') = ''
    order by private.safe_numeric(e->'order'), ord
  loop
    v_name := left(private.js_trim(r.e->>'name'), 80);
    if private.js_trim(v_name) = '' then v_name := 'Untitled'; end if;
    v_match := roots_by_name->>lower(v_name);
    if v_match is not null then
      if r.e->>'id' is not null then cat_map := cat_map || jsonb_build_object(r.e->>'id', v_match); end if;
      continue;
    end if;
    v_id := case when private.is_clean_id(r.e->>'id') and not used_ids ? (r.e->>'id')
                 then r.e->>'id' else private.gen_id('cat') end;
    used_ids := used_ids || jsonb_build_object(v_id, true);
    root_ids := root_ids || jsonb_build_object(v_id, true);
    roots_by_name := roots_by_name || jsonb_build_object(lower(v_name), v_id);
    if r.e->>'id' is not null then cat_map := cat_map || jsonb_build_object(r.e->>'id', v_id); end if;
    insert into public.categories (owner_id, id, name, icon, parent_id, sort_order)
    values (v_uid, v_id, v_name, private.clean_icon(r.e->>'icon'), '', private.clamp_order(next_root_order));
    next_root_order := next_root_order + 1;
  end loop;

  -- Subcategories, in local order (parent must map to a root)
  for r in
    select e, ord from jsonb_array_elements(
      case when jsonb_typeof(p_payload->'categories') = 'array' then p_payload->'categories' else '[]' end
    ) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'object' and coalesce(e->>'parentId', '') <> ''
    order by private.safe_numeric(e->'order'), ord
  loop
    v_parent := cat_map->>(r.e->>'parentId');
    if v_parent is null or not root_ids ? v_parent then continue; end if;
    v_name := left(private.js_trim(r.e->>'name'), 80);
    if private.js_trim(v_name) = '' then v_name := 'Subcategory'; end if;
    v_match := subs_by_key->>(v_parent || '::' || lower(v_name));
    if v_match is not null then
      if r.e->>'id' is not null then cat_map := cat_map || jsonb_build_object(r.e->>'id', v_match); end if;
      continue;
    end if;
    v_id := case when private.is_clean_id(r.e->>'id') and not used_ids ? (r.e->>'id')
                 then r.e->>'id' else private.gen_id('sub') end;
    used_ids := used_ids || jsonb_build_object(v_id, true);
    subs_by_key := subs_by_key || jsonb_build_object(v_parent || '::' || lower(v_name), v_id);
    sub_parent := sub_parent || jsonb_build_object(v_id, v_parent);
    if r.e->>'id' is not null then cat_map := cat_map || jsonb_build_object(r.e->>'id', v_id); end if;
    insert into public.categories (owner_id, id, name, icon, parent_id, sort_order)
    values (v_uid, v_id, v_name, private.clean_icon(r.e->>'icon'), v_parent,
            private.clamp_order(private.safe_numeric(r.e->'order')));
  end loop;

  -- Bookmarks (set-based): map ids, skip invalid URLs / unknown categories,
  -- skip URLs already in the cloud workspace or earlier in the payload.
  with src as (
    select e, ord,
           private.clean_url(e->>'url') as url,
           coalesce(cat_map->>(e->>'categoryId'), e->>'categoryId') as mapped_cat,
           case when coalesce(e->>'subcategoryId', '') = '' then ''
                else coalesce(cat_map->>(e->>'subcategoryId'), e->>'subcategoryId') end as mapped_sub
    from jsonb_array_elements(
      case when jsonb_typeof(p_payload->'bookmarks') = 'array' then p_payload->'bookmarks' else '[]' end
    ) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'object'
  ), resolved as (
    -- A bookmark pointing at a subcategory as its category is re-homed under
    -- that subcategory's root (keeps the 2-level invariant).
    select e, ord, url,
           case when root_ids ? mapped_cat then mapped_cat else sub_parent->>mapped_cat end as cat_id,
           case when root_ids ? mapped_cat then mapped_sub else mapped_cat end as sub_raw
    from src
    where url <> ''
  ), valid as (
    select e, ord, url, cat_id,
           case when sub_raw <> '' and sub_parent->>sub_raw = cat_id then sub_raw else '' end as sub_id
    from resolved
    where cat_id is not null
      and not exists (select 1 from public.bookmarks b
                      where b.owner_id = v_uid and lower(b.url) = lower(resolved.url))
  ), deduped as (
    select *, row_number() over (partition by lower(url) order by ord) as url_rank
    from valid
  ), with_ids as (
    select d.*,
           case when private.is_clean_id(e->>'id')
                 and not exists (select 1 from public.bookmarks b where b.owner_id = v_uid and b.id = d.e->>'id')
                 and row_number() over (partition by e->>'id' order by ord) = 1
                then e->>'id' else private.gen_id('bm') end as new_id
    from deduped d
    where url_rank = 1
  )
  insert into public.bookmarks (owner_id, id, title, url, description, category_id, subcategory_id, is_favorite)
  select v_uid, new_id,
         coalesce(nullif(left(private.js_trim(e->>'title'), 120), ''), left(url, 120)),
         url,
         left(coalesce(e->>'description', ''), 400),
         cat_id, sub_id,
         coalesce(e->'isFavorite' = 'true'::jsonb, false)
  from with_ids
  order by ord;

  -- Quick shortcuts (set-based), appended after existing ones
  with src as (
    select e, ord, private.clean_url(e->>'url') as url
    from jsonb_array_elements(
      case when jsonb_typeof(p_payload->'quickShortcuts') = 'array' then p_payload->'quickShortcuts' else '[]' end
    ) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'object'
  ), valid as (
    select *, row_number() over (partition by lower(url) order by ord) as url_rank
    from src
    where url <> ''
      and not exists (select 1 from public.quick_shortcuts q
                      where q.owner_id = v_uid and lower(q.url) = lower(src.url))
  ), kept as (
    select v.*,
           row_number() over (order by ord) - 1 as idx,
           case when private.is_clean_id(e->>'id')
                 and not exists (select 1 from public.quick_shortcuts q where q.owner_id = v_uid and q.id = v.e->>'id')
                 and row_number() over (partition by e->>'id' order by ord) = 1
                then e->>'id' else private.gen_id('qs') end as new_id,
           case when e->>'iconType' in ('lucide', 'custom') then e->>'iconType' else 'favicon' end as icon_type
    from valid v
    where url_rank = 1
  )
  insert into public.quick_shortcuts (owner_id, id, title, url, icon_type, custom_icon, sort_order)
  select v_uid, new_id,
         coalesce(nullif(left(private.js_trim(e->>'title'), 80), ''), 'Shortcut'),
         url, icon_type,
         case when icon_type = 'favicon' then '' else left(private.js_trim(e->>'customIcon'), 500) end,
         private.clamp_order((select count(*) from public.quick_shortcuts q where q.owner_id = v_uid) + idx)
  from kept
  order by ord;
end $$;

-- ---------------------------------------------------------------------------
-- Chrome import plan, merge or replace (POST /api/workspace/import-plan)
-- Returns {addedCategories, addedBookmarks, skippedDuplicates, expandedCategoryIds}
-- ---------------------------------------------------------------------------
create or replace function public.myfav_import_chrome_plan(p_plan jsonb, p_replace_all boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  temp_to_real jsonb := '{}'::jsonb;
  roots_by_name jsonb := '{}'::jsonb;
  subs_by_key jsonb := '{}'::jsonb;
  expanded text[] := '{}';
  next_root_order integer := 0;
  added_categories integer := 0;
  added_bookmarks integer := 0;
  skipped integer := 0;
  r record;
  i integer;
  v_name text; v_id text; v_parent text; v_match text; v_key text;
begin
  perform private.lock_owner(v_uid);
  if jsonb_typeof(p_plan) <> 'object'
     or jsonb_typeof(p_plan->'categories') <> 'array'
     or jsonb_typeof(p_plan->'bookmarks') <> 'array' then
    raise exception 'Invalid import plan payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_plan->'bookmarks') > 50000 or jsonb_array_length(p_plan->'categories') > 5000 then
    raise exception 'Import plan is too large' using errcode = '54000';
  end if;

  if coalesce(p_replace_all, false) then
    delete from public.shared_categories where owner_id = v_uid;
    delete from public.quick_shortcuts   where owner_id = v_uid;
    delete from public.bookmarks         where owner_id = v_uid;
    delete from public.categories        where owner_id = v_uid;
  else
    for r in select id, name, parent_id from public.categories where owner_id = v_uid loop
      if r.parent_id = '' then
        roots_by_name := roots_by_name || jsonb_build_object(lower(private.js_trim(r.name)), r.id);
      else
        subs_by_key := subs_by_key || jsonb_build_object(r.parent_id || '::' || lower(private.js_trim(r.name)), r.id);
      end if;
    end loop;
    select count(*) into next_root_order from public.categories where owner_id = v_uid and parent_id = '';
  end if;

  -- Root categories
  i := 0;
  for r in
    select e from jsonb_array_elements(p_plan->'categories') with ordinality t(e, ord)
    where jsonb_typeof(e) = 'object' and coalesce(e->>'parentTempId', '') = ''
    order by private.safe_numeric(e->'order'), ord
  loop
    v_name := left(private.js_trim(r.e->>'name'), 80);
    if private.js_trim(v_name) = '' then v_name := 'Bookmarks'; end if;
    v_match := case when coalesce(p_replace_all, false) then null else roots_by_name->>lower(v_name) end;
    if v_match is not null then
      temp_to_real := temp_to_real || jsonb_build_object(coalesce(r.e->>'tempId', ''), v_match);
      expanded := expanded || v_match;
    else
      v_id := private.gen_id('cat_' || i);
      temp_to_real := temp_to_real || jsonb_build_object(coalesce(r.e->>'tempId', ''), v_id);
      expanded := expanded || v_id;
      roots_by_name := roots_by_name || jsonb_build_object(lower(v_name), v_id);
      added_categories := added_categories + 1;
      insert into public.categories (owner_id, id, name, icon, parent_id, sort_order)
      values (v_uid, v_id, v_name, private.clean_icon(r.e->>'icon'), '',
              private.clamp_order(case when coalesce(p_replace_all, false) then i else next_root_order end));
      if not coalesce(p_replace_all, false) then next_root_order := next_root_order + 1; end if;
    end if;
    i := i + 1;
  end loop;

  -- Subcategories
  i := 0;
  for r in
    select e from jsonb_array_elements(p_plan->'categories') with ordinality t(e, ord)
    where jsonb_typeof(e) = 'object' and coalesce(e->>'parentTempId', '') <> ''
    order by private.safe_numeric(e->'order'), ord
  loop
    v_parent := temp_to_real->>(r.e->>'parentTempId');
    -- parent must be a root that this import resolved
    if v_parent is null or not (v_parent = any(expanded)) then i := i + 1; continue; end if;
    v_name := left(private.js_trim(r.e->>'name'), 80);
    if private.js_trim(v_name) = '' then v_name := 'Subcategory'; end if;
    v_key := v_parent || '::' || lower(v_name);
    v_match := case when coalesce(p_replace_all, false) then null else subs_by_key->>v_key end;
    if v_match is not null then
      temp_to_real := temp_to_real || jsonb_build_object(coalesce(r.e->>'tempId', ''), v_match);
    else
      v_id := private.gen_id('sub_' || i);
      temp_to_real := temp_to_real || jsonb_build_object(coalesce(r.e->>'tempId', ''), v_id);
      subs_by_key := subs_by_key || jsonb_build_object(v_key, v_id);
      added_categories := added_categories + 1;
      insert into public.categories (owner_id, id, name, icon, parent_id, sort_order)
      values (v_uid, v_id, v_name, private.clean_icon(r.e->>'icon'), v_parent,
              private.clamp_order(private.safe_numeric(r.e->'order')));
    end if;
    i := i + 1;
  end loop;

  -- Bookmarks (set-based). Duplicate semantics match the original:
  --   merge  : URL already in workspace or earlier in this file -> skipped (counted)
  --   replace: no dedupe (workspace was emptied first)
  create temporary table if not exists pg_temp.myfav_import_rows (
    rn bigint, title text, url text, cat_id text, sub_id text, is_dup boolean
  ) on commit drop;
  truncate pg_temp.myfav_import_rows;

  insert into pg_temp.myfav_import_rows (rn, title, url, cat_id, sub_id, is_dup)
  with src as (
    select e, ord, private.clean_url(e->>'url') as url
    from jsonb_array_elements(p_plan->'bookmarks') with ordinality t(e, ord)
    where jsonb_typeof(e) = 'object'
  ), ordered as (
    select e, url, row_number() over (order by private.safe_numeric(e->'order'), ord) as rn
    from src where url <> ''
  ), flagged as (
    select o.*,
      case when coalesce(p_replace_all, false) then false
           else exists (select 1 from public.bookmarks b where b.owner_id = v_uid and lower(b.url) = lower(o.url))
                or row_number() over (partition by lower(o.url) order by o.rn) > 1
      end as is_dup
    from ordered o
  )
  select rn,
         coalesce(nullif(left(private.js_trim(e->>'title'), 120), ''), left(url, 120)),
         url,
         temp_to_real->>(e->>'categoryTempId'),
         case when coalesce(e->>'subcategoryTempId', '') = '' then ''
              else coalesce(temp_to_real->>(e->>'subcategoryTempId'), '') end,
         is_dup
  from flagged;

  select count(*) into skipped from pg_temp.myfav_import_rows where is_dup;

  -- Only keep a subcategory when it really belongs to the resolved root.
  insert into public.bookmarks (owner_id, id, title, url, description, category_id, subcategory_id, is_favorite)
  select v_uid, private.gen_id('bm_' || lpad((rn - 1)::text, 4, '0')), x.title, x.url, '', x.cat_id,
         case when x.sub_id <> '' and exists (select 1 from public.categories c
                     where c.owner_id = v_uid and c.id = x.sub_id and c.parent_id = x.cat_id)
              then x.sub_id else '' end,
         false
  from pg_temp.myfav_import_rows x
  where not x.is_dup and x.cat_id is not null
    and exists (select 1 from public.categories c where c.owner_id = v_uid and c.id = x.cat_id and c.parent_id = '')
  order by x.rn;
  get diagnostics added_bookmarks = row_count;

  return jsonb_build_object(
    'addedCategories', added_categories,
    'addedBookmarks', added_bookmarks,
    'skippedDuplicates', skipped,
    'expandedCategoryIds', to_jsonb(expanded)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Bookmarks: create or update (POST /api/bookmarks)
-- ---------------------------------------------------------------------------
create or replace function public.myfav_save_bookmark(p jsonb)
returns public.bookmarks language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_url text := private.clean_url(p->>'url');
  v_title text;
  v_id text := p->>'id';
  v_row public.bookmarks;
begin
  if v_url = '' then
    raise exception 'Invalid bookmark URL.' using errcode = '22023';
  end if;
  v_title := coalesce(nullif(left(private.js_trim(p->>'title'), 120), ''), left(v_url, 120));

  if private.is_clean_id(v_id) then
    update public.bookmarks set
      title = v_title, url = v_url,
      description = left(coalesce(p->>'description', ''), 400),
      category_id = coalesce(p->>'categoryId', ''),
      subcategory_id = coalesce(p->>'subcategoryId', ''),
      is_favorite = coalesce(p->'isFavorite' = 'true'::jsonb, false)
    where owner_id = v_uid and id = v_id
    returning * into v_row;
    if found then return v_row; end if;
  else
    v_id := private.gen_id('bm');
  end if;

  insert into public.bookmarks (owner_id, id, title, url, description, category_id, subcategory_id, is_favorite)
  values (v_uid, v_id, v_title, v_url, left(coalesce(p->>'description', ''), 400),
          coalesce(p->>'categoryId', ''), coalesce(p->>'subcategoryId', ''),
          coalesce(p->'isFavorite' = 'true'::jsonb, false))
  returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Quick shortcuts: create or update (POST /api/shortcuts) and reorder
-- ---------------------------------------------------------------------------
create or replace function public.myfav_save_quick_shortcut(p jsonb)
returns public.quick_shortcuts language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_url text := private.clean_url(p->>'url');
  v_icon_type text := case when p->>'iconType' in ('lucide', 'custom') then p->>'iconType' else 'favicon' end;
  v_custom text;
  v_title text;
  v_id text := p->>'id';
  v_count integer;
  v_row public.quick_shortcuts;
begin
  if v_url = '' then
    raise exception 'Invalid shortcut URL.' using errcode = '22023';
  end if;
  v_title := coalesce(nullif(left(private.js_trim(p->>'title'), 80), ''), 'Shortcut');
  v_custom := case when v_icon_type = 'favicon' then '' else left(private.js_trim(p->>'customIcon'), 500) end;

  if private.is_clean_id(v_id) then
    update public.quick_shortcuts set
      title = v_title, url = v_url, icon_type = v_icon_type, custom_icon = v_custom
    where owner_id = v_uid and id = v_id
    returning * into v_row;
    if found then return v_row; end if;
  else
    v_id := private.gen_id('qs');
  end if;

  perform private.lock_owner(v_uid);
  select count(*) into v_count from public.quick_shortcuts where owner_id = v_uid;
  insert into public.quick_shortcuts (owner_id, id, title, url, icon_type, custom_icon, sort_order)
  values (v_uid, v_id, v_title, v_url, v_icon_type, v_custom, private.clamp_order(v_count))
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.myfav_reorder_quick_shortcuts(p_ordered_ids text[])
returns void language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := private.require_uid();
begin
  perform private.lock_owner(v_uid);
  update public.quick_shortcuts q
     set sort_order = private.clamp_order(x.idx - 1)
    from unnest(coalesce(p_ordered_ids, '{}')) with ordinality as x(id, idx)
   where q.owner_id = v_uid and q.id = x.id;
end $$;

-- ---------------------------------------------------------------------------
-- Categories: create, delete (with optional fallback), tree reorder
-- ---------------------------------------------------------------------------
create or replace function public.myfav_create_category(p_id text, p_name text, p_icon text, p_parent_id text)
returns public.categories language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_name text := left(private.js_trim(p_name), 80);
  v_parent text := coalesce(p_parent_id, '');
  v_count integer;
  v_row public.categories;
begin
  if private.js_trim(v_name) = '' then
    raise exception 'Category name is required.' using errcode = '22023';
  end if;
  perform private.lock_owner(v_uid);
  select count(*) into v_count from public.categories where owner_id = v_uid and parent_id = v_parent;
  insert into public.categories (owner_id, id, name, icon, parent_id, sort_order)
  values (v_uid,
          case when private.is_clean_id(p_id) then p_id
               else private.gen_id(case when v_parent <> '' then 'sub' else 'cat' end) end,
          v_name, private.clean_icon(p_icon), v_parent, private.clamp_order(v_count))
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.myfav_delete_category(p_id text, p_fallback_category_id text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_target public.categories;
begin
  perform private.lock_owner(v_uid);
  select * into v_target from public.categories where owner_id = v_uid and id = p_id;
  if not found then return; end if;

  if v_target.parent_id = '' then
    if coalesce(p_fallback_category_id, '') <> '' then
      if not exists (select 1 from public.categories
                     where owner_id = v_uid and id = p_fallback_category_id
                       and parent_id = '' and id <> p_id) then
        raise exception 'Fallback category must be another of your root categories' using errcode = '23503';
      end if;
      update public.bookmarks set category_id = p_fallback_category_id, subcategory_id = ''
       where owner_id = v_uid and category_id = p_id;
    else
      delete from public.bookmarks where owner_id = v_uid and category_id = p_id;
    end if;
    delete from public.categories where owner_id = v_uid and parent_id = p_id;
    delete from public.shared_categories where owner_id = v_uid and category_id = p_id;
  else
    update public.bookmarks set subcategory_id = ''
     where owner_id = v_uid and subcategory_id = p_id;
  end if;

  delete from public.categories where owner_id = v_uid and id = p_id;
end $$;

create or replace function public.myfav_reorder_category_tree(p_payload jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_dragged text := p_payload->>'draggedId';
  v_new_parent text := coalesce(p_payload->>'newParentId', '');
  r record;
begin
  perform private.lock_owner(v_uid);
  if not private.is_clean_id(v_dragged) or not (v_new_parent = '' or private.is_clean_id(v_new_parent)) then
    raise exception 'Invalid reorder payload' using errcode = '22023';
  end if;

  for r in select e from jsonb_array_elements(
             case when jsonb_typeof(p_payload->'reorderedSiblings') = 'array' then p_payload->'reorderedSiblings' else '[]' end) e
  loop
    if r.e->>'id' = v_dragged then
      update public.categories set parent_id = v_new_parent,
             sort_order = private.clamp_order(private.safe_numeric(r.e->'order'))
       where owner_id = v_uid and id = v_dragged;
    else
      update public.categories set sort_order = private.clamp_order(private.safe_numeric(r.e->'order'))
       where owner_id = v_uid and id = r.e->>'id';
    end if;
  end loop;

  for r in select e from jsonb_array_elements(
             case when jsonb_typeof(p_payload->'childSubsToMove') = 'array' then p_payload->'childSubsToMove' else '[]' end) e
  loop
    update public.categories set parent_id = v_new_parent,
           sort_order = private.clamp_order(private.safe_numeric(r.e->'order'))
     where owner_id = v_uid and id = r.e->>'id';
  end loop;

  for r in select e from jsonb_array_elements(
             case when jsonb_typeof(p_payload->'bookmarksToUpdate') = 'array' then p_payload->'bookmarksToUpdate' else '[]' end) e
  loop
    update public.bookmarks set category_id = coalesce(r.e->>'categoryId', ''),
           subcategory_id = coalesce(r.e->>'subcategoryId', '')
     where owner_id = v_uid and id = r.e->>'id';
  end loop;
  -- Deferred constraint triggers validate the final tree at COMMIT;
  -- any invalid result rolls back the whole move.
end $$;

-- ---------------------------------------------------------------------------
-- Sharing: publish / update a snapshot (POST /api/shares)
-- ---------------------------------------------------------------------------
create or replace function public.myfav_publish_share(p jsonb)
returns public.shared_categories language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_name text := coalesce(nullif(left(private.js_trim(p->>'categoryName'), 80), ''), 'Shared Collection');
  v_icon text := private.clean_icon(p->>'categoryIcon');
  v_subs jsonb;
  v_bms jsonb;
  v_row public.shared_categories;
begin
  -- Rebuild snapshot arrays with whitelisted keys only.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s->>'id',
           'name', left(coalesce(s->>'name', ''), 80),
           'icon', private.clean_icon(s->>'icon'),
           'order', private.safe_numeric(s->'order')) order by ord), '[]')
    into v_subs
    from jsonb_array_elements(case when jsonb_typeof(p->'subcategories') = 'array' then p->'subcategories' else '[]' end)
         with ordinality t(s, ord)
   where jsonb_typeof(s) = 'object' and private.is_clean_id(s->>'id');

  select coalesce(jsonb_agg(jsonb_build_object(
           'title', left(coalesce(b->>'title', ''), 120),
           'url', private.clean_url(b->>'url'),
           'description', left(coalesce(b->>'description', ''), 400),
           'subcategoryId', case when private.is_clean_id(b->>'subcategoryId') then b->>'subcategoryId' else '' end,
           'isFavorite', coalesce(b->'isFavorite' = 'true'::jsonb, false)) order by ord), '[]')
    into v_bms
    from jsonb_array_elements(case when jsonb_typeof(p->'bookmarks') = 'array' then p->'bookmarks' else '[]' end)
         with ordinality t(b, ord)
   where jsonb_typeof(b) = 'object' and private.clean_url(b->>'url') <> '';

  if private.is_clean_id(p->>'existingShareId') then
    update public.shared_categories set
      category_name = v_name, category_icon = v_icon, is_public = true,
      subcategories = v_subs, bookmarks = v_bms
    where owner_id = v_uid and id = p->>'existingShareId'
    returning * into v_row;
    if found then return v_row; end if;
  end if;

  insert into public.shared_categories (id, owner_id, category_id, category_name, category_icon, is_public, subcategories, bookmarks)
  values (private.gen_id('share'), v_uid, coalesce(p->>'categoryId', ''), v_name, v_icon, true, v_subs, v_bms)
  returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Public share read (GET /api/shares/:shareId) — the ONLY anonymous entry
-- point. SECURITY DEFINER because `anonymous` has no table access; it returns a
-- single explicitly-published snapshot with whitelisted fields (no owner id,
-- no email, no settings). Unknown / revoked ids return NULL.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_share(p_share_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id,
    'ownerId', '',
    'categoryId', s.category_id,
    'categoryName', s.category_name,
    'categoryIcon', s.category_icon,
    'isPublic', s.is_public,
    'subcategories', s.subcategories,
    'bookmarks', s.bookmarks,
    'createdAt', s.created_at,
    'updatedAt', s.updated_at)
  from public.shared_categories s
  where private.is_clean_id(p_share_id) and s.id = p_share_id and s.is_public
$$;

-- ---------------------------------------------------------------------------
-- Execute grants: deny by default, allow exactly what is needed.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anonymous;
grant execute on function
  public.myfav_clear_workspace(),
  public.myfav_sync_local_workspace(jsonb),
  public.myfav_import_chrome_plan(jsonb, boolean),
  public.myfav_save_bookmark(jsonb),
  public.myfav_save_quick_shortcut(jsonb),
  public.myfav_reorder_quick_shortcuts(text[]),
  public.myfav_create_category(text, text, text, text),
  public.myfav_delete_category(text, text),
  public.myfav_reorder_category_tree(jsonb),
  public.myfav_publish_share(jsonb)
to authenticated;
grant execute on function public.get_public_share(text) to anonymous, authenticated;

-- Make sure future functions in public are not silently exposed to `anonymous`.
alter default privileges in schema public revoke execute on functions from public, anonymous;

-- ---------------------------------------------------------------------------
-- Batch edit / delete (POST /api/bookmarks/batch-edit, /batch-delete).
-- One statement each => all-or-nothing for any selection size.
-- ---------------------------------------------------------------------------
create or replace function public.myfav_batch_edit_bookmarks(
  p_ids text[], p_category_id text default null, p_subcategory_id text default null,
  p_favorite_status text default 'keep')
returns void language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := private.require_uid();
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then return; end if;
  if array_length(p_ids, 1) > 20000 then
    raise exception 'Too many bookmarks selected' using errcode = '54000';
  end if;
  update public.bookmarks b set
    category_id    = case when coalesce(p_category_id, '') <> '' then p_category_id else b.category_id end,
    subcategory_id = case when coalesce(p_category_id, '') <> '' then coalesce(p_subcategory_id, '') else b.subcategory_id end,
    is_favorite    = case p_favorite_status when 'favorite' then true when 'unfavorite' then false else b.is_favorite end
  where b.owner_id = v_uid and b.id = any(p_ids);
end $$;

create or replace function public.myfav_batch_delete_bookmarks(p_ids text[])
returns void language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := private.require_uid();
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then return; end if;
  delete from public.bookmarks where owner_id = v_uid and id = any(p_ids);
end $$;

revoke execute on function public.myfav_batch_edit_bookmarks(text[], text, text, text),
                           public.myfav_batch_delete_bookmarks(text[]) from public, anonymous;
grant execute on function public.myfav_batch_edit_bookmarks(text[], text, text, text),
                          public.myfav_batch_delete_bookmarks(text[]) to authenticated;
