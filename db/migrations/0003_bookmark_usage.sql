-- MyFav V2: per-website usage, used to order the Main Page
-- (pinned first, then most used, then A–Z).
--
-- * open_count / last_opened_at live on the owner's own bookmark row, so they
--   inherit the existing RLS (owner = auth.uid() AND verified) and are synced
--   across the owner's devices.
-- * Opening a website is not an edit: updated_at is left unchanged when only
--   the usage columns change.
-- * Counting goes through one RPC that increments atomically.

alter table public.bookmarks
  add column if not exists open_count integer not null default 0 check (open_count >= 0),
  add column if not exists last_opened_at timestamptz;

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
    -- Usage-only change (opening a website): keep the last-edited time.
    if tg_table_name = 'bookmarks'
       and (to_jsonb(new) - 'open_count' - 'last_opened_at' - 'updated_at')
         = (to_jsonb(old) - 'open_count' - 'last_opened_at' - 'updated_at') then
      new.updated_at := old.updated_at;
    else
      new.updated_at := now();
    end if;
  end if;
  return new;
end $$;

create or replace function public.myfav_record_bookmark_open(p_id text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_id is null or not private.is_clean_id(p_id) then
    raise exception 'invalid bookmark id' using errcode = '22023';
  end if;
  update public.bookmarks
     set open_count = least(open_count + 1, 2000000000),
         last_opened_at = now()
   where owner_id = v_uid and id = p_id;
end $$;

revoke all on function public.myfav_record_bookmark_open(text) from public;
grant execute on function public.myfav_record_bookmark_open(text) to authenticated;
