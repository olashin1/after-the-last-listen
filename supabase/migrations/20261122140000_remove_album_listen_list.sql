-- Remove an album, and the Listen List (decided with the user, docs/decisions.md).
--
-- remove_user_album(): deletes the caller's collection record for an album with all its listens
-- (PRD §5 "Remove / correct"). The confirmation in the UI states how many listens go.
--
-- listen_list: albums a user wants to listen to (a new feature, not in the PRD). It has the same
-- visibility as albums and the diary (can_view_user_content). Clients only read it; adding and
-- removing go through RPC. Logging an album removes it from the list (log_album below).
-- When apply_album_redirect() moves user data to a merge survivor (the open Phase 3 merge step), it
-- must move listen_list rows too.

-- ---------------------------------------------------------------------------------------------
-- remove_user_album
-- ---------------------------------------------------------------------------------------------

-- Remove the caller's album from their collection: the collection record and (by cascade) every
-- listen. Returns how many listens were deleted.
-- Errors: not_authenticated 42501, not_in_collection P0002.
create function public.remove_user_album(p_album_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_user_album_id bigint;
  v_listens integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select ua.id into v_user_album_id
  from public.user_albums ua
  where ua.user_id = v_uid and ua.album_id = p_album_id
  for update;
  if not found then
    raise exception 'not_in_collection' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_listens from public.listens l where l.user_album_id = v_user_album_id;
  delete from public.user_albums ua where ua.id = v_user_album_id;
  return v_listens;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- listen_list
-- ---------------------------------------------------------------------------------------------

create table public.listen_list (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  album_id bigint not null references catalog.albums (id),
  added_at timestamptz not null default now(),
  constraint listen_list_user_album_key unique (user_id, album_id)
);

comment on table public.listen_list is
  'Albums a user wants to listen to. Written only by add_to_listen_list(), remove_from_listen_list() and log_album().';

create index listen_list_user_added_idx on public.listen_list (user_id, added_at desc, id desc);
create index listen_list_album_id_idx on public.listen_list (album_id);

alter table public.listen_list enable row level security;

create policy "Listen List is readable when the owner's content is visible"
  on public.listen_list
  for select
  to anon, authenticated
  using (public.can_view_user_content(user_id));

revoke all on public.listen_list from public, anon, authenticated, service_role;
grant select on public.listen_list to anon, authenticated, service_role;

-- Add an album to the caller's Listen List. Adding it again changes nothing.
-- Errors: not_authenticated 42501, album_not_found P0002, album_merged 22023.
create function public.add_to_listen_list(p_album_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_merged_into bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select a.merged_into_id into v_merged_into from catalog.albums a where a.id = p_album_id;
  if not found then
    raise exception 'album_not_found' using errcode = 'P0002';
  end if;
  if v_merged_into is not null then
    raise exception 'album_merged' using errcode = '22023';
  end if;

  insert into public.listen_list (user_id, album_id) values (v_uid, p_album_id)
  on conflict (user_id, album_id) do nothing;
end;
$$;

-- Remove an album from the caller's Listen List. No error if it isn't there.
-- Errors: not_authenticated 42501.
create function public.remove_from_listen_list(p_album_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.listen_list ll where ll.user_id = v_uid and ll.album_id = p_album_id;
end;
$$;

-- A user's Listen List, most recently added first. Empty when the user's content isn't visible to
-- the caller (RLS). Keyset pagination: pass the last row's added_at and listen_list_id. lim is
-- clamped to 1–100.
create function public.get_listen_list(
  p_username text,
  p_before_added timestamptz default null,
  p_before_id bigint default null,
  p_lim integer default 48
)
returns table (
  listen_list_id bigint,
  album_id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  first_release_date text,
  added_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ll.id, ll.album_id, a.mbid, a.title, a.artist_credit, a.first_release_date, ll.added_at
  from public.profiles p
  join public.listen_list ll on ll.user_id = p.user_id
  join catalog.albums a on a.id = ll.album_id
  where p.username = lower(btrim(p_username))
    and (p_before_added is null or (ll.added_at, ll.id) < (p_before_added, p_before_id))
  order by ll.added_at desc, ll.id desc
  limit least(greatest(coalesce(p_lim, 48), 1), 100);
$$;

-- ---------------------------------------------------------------------------------------------
-- log_album: unchanged (20261121210000_logging.sql), except that logging an album now takes it off
-- the Listen List
-- ---------------------------------------------------------------------------------------------

create or replace function public.log_album(
  p_album_id bigint,
  p_listened_on date,
  p_today date,
  p_rating numeric default null,
  p_review text default null,
  p_shooting_star_recording_mbid uuid default null,
  p_request_id uuid default null
)
returns table (user_album_id bigint, listen_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_merged_into bigint;
  v_values record;
  v_user_album_id bigint;
  v_listen_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_request_id is not null then
    select l.user_album_id, l.id into v_user_album_id, v_listen_id
    from public.listens l
    where l.user_id = v_uid and l.request_id = p_request_id;
    if found then
      return query select v_user_album_id, v_listen_id;
      return;
    end if;
  end if;

  select a.merged_into_id into v_merged_into from catalog.albums a where a.id = p_album_id;
  if not found then
    raise exception 'album_not_found' using errcode = 'P0002';
  end if;
  if v_merged_into is not null then
    raise exception 'album_merged' using errcode = '22023';
  end if;

  if p_listened_on is null or p_today is null or p_listened_on < date '1900-01-01'
     or abs(p_today - (now() at time zone 'utc')::date) > 1 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if p_listened_on > p_today then
    raise exception 'future_date' using errcode = '22023';
  end if;

  select * into v_values
  from private.validate_entry(v_uid, p_album_id, p_rating, p_review, p_shooting_star_recording_mbid);

  -- ON CONFLICT: a double tap never creates a second collection record (PRD §9). Only real changes
  -- update the row, so updated_at means "last edited".
  insert into public.user_albums as ua
    (user_id, album_id, rating, review, shooting_star_recording_mbid, shooting_star_title)
  values
    (v_uid, p_album_id, p_rating, v_values.o_review, p_shooting_star_recording_mbid, v_values.o_shooting_star_title)
  on conflict (user_id, album_id) do update
    set rating = excluded.rating,
        review = excluded.review,
        shooting_star_recording_mbid = excluded.shooting_star_recording_mbid,
        shooting_star_title = excluded.shooting_star_title
    where (ua.rating, ua.review, ua.shooting_star_recording_mbid, ua.shooting_star_title)
          is distinct from
          (excluded.rating, excluded.review, excluded.shooting_star_recording_mbid, excluded.shooting_star_title)
  returning ua.id into v_user_album_id;

  if v_user_album_id is null then
    select ua.id into v_user_album_id
    from public.user_albums ua
    where ua.user_id = v_uid and ua.album_id = p_album_id;
  end if;

  insert into public.listens as l (user_album_id, user_id, listened_on, request_id)
  values (v_user_album_id, v_uid, p_listened_on, p_request_id)
  on conflict (user_id, request_id) do nothing
  returning l.id into v_listen_id;

  -- A simultaneous submit with the same request id got there first.
  if v_listen_id is null then
    select l.user_album_id, l.id into v_user_album_id, v_listen_id
    from public.listens l
    where l.user_id = v_uid and l.request_id = p_request_id;
  end if;

  -- Logging an album takes it off the Listen List.
  delete from public.listen_list ll where ll.user_id = v_uid and ll.album_id = p_album_id;

  return query select v_user_album_id, v_listen_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.remove_user_album(bigint) from public, anon;
grant execute on function public.remove_user_album(bigint) to authenticated;
revoke execute on function public.add_to_listen_list(bigint) from public, anon;
grant execute on function public.add_to_listen_list(bigint) to authenticated;
revoke execute on function public.remove_from_listen_list(bigint) from public, anon;
grant execute on function public.remove_from_listen_list(bigint) to authenticated;
revoke execute on function public.get_listen_list(text, timestamptz, bigint, integer) from public;
grant execute on function public.get_listen_list(text, timestamptz, bigint, integer) to anon, authenticated;
