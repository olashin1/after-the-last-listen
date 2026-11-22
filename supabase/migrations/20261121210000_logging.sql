-- Logging (PRD §5 "Log album" / "Edit album", Phase 3): log_album() saves the collection record and
-- a dated listen in one transaction; update_user_album() edits rating, review and Shooting Star.
-- Read functions for the album page, My Albums and the diary. They're needed because the catalog
-- schema isn't in the Data API, so PostgREST can't join user_albums to albums. They're security
-- invoker, so the RLS on user_albums and listens (can_view_user_content) decides what they return.
--
-- Decisions (docs/decisions.md, Phase 3): logging an album that's already in the collection replaces
-- its rating, review and Shooting Star with the submitted values (the form is prefilled) and adds a
-- listen. A repeated request id returns the existing listen. The Shooting Star must be on the stored
-- tracklist, or be the entry's current pick (so a prefilled re-log works with no tracklist loaded).

-- ---------------------------------------------------------------------------------------------
-- Shared validation
-- ---------------------------------------------------------------------------------------------

-- Validate an entry's editable values for user p_uid and album p_album_id. Returns the review to store
-- (trimmed, blank → NULL) and the Shooting Star title to copy (NULL when there's no star).
-- Errors: invalid_rating, review_too_long, invalid_shooting_star (all 22023).
create function private.validate_entry(
  p_uid uuid,
  p_album_id bigint,
  p_rating numeric,
  p_review text,
  p_shooting_star_recording_mbid uuid,
  out o_review text,
  out o_shooting_star_title text
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_rating is not null and (p_rating < 0.5 or p_rating > 5 or p_rating * 2 <> trunc(p_rating * 2)) then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;

  o_review := nullif(btrim(p_review), '');
  if char_length(o_review) > 5000 then
    raise exception 'review_too_long' using errcode = '22023';
  end if;

  if p_shooting_star_recording_mbid is null then
    o_shooting_star_title := null;
    return;
  end if;

  -- A recording can appear twice on a tracklist (e.g. a reprise on another disc); take the first.
  select t.title into o_shooting_star_title
  from catalog.tracks t
  where t.album_id = p_album_id and t.recording_mbid = p_shooting_star_recording_mbid
  order by t.disc_number, t.position
  limit 1;
  if found then
    return;
  end if;

  -- Not on the stored tracklist (not loaded, or changed upstream): only the current pick is kept.
  select ua.shooting_star_title into o_shooting_star_title
  from public.user_albums ua
  where ua.user_id = p_uid and ua.album_id = p_album_id
    and ua.shooting_star_recording_mbid = p_shooting_star_recording_mbid;
  if not found then
    raise exception 'invalid_shooting_star' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.validate_entry(uuid, bigint, numeric, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- log_album
-- ---------------------------------------------------------------------------------------------

-- Log a listen of an album for the caller: create or update their collection record and add a
-- listen, in one transaction. p_today is the caller's local date (PRD §9), used for the future-date
-- check; it must be within a day of the server's UTC date. p_request_id is generated once per submit
-- by the client: a repeat returns the existing listen and changes nothing (double taps, retries).
-- Errors (message / SQLSTATE): not_authenticated 42501, album_not_found P0002, album_merged 22023,
-- invalid_date 22023, future_date 22023, invalid_rating 22023, review_too_long 22023,
-- invalid_shooting_star 22023.
create function public.log_album(
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

  return query select v_user_album_id, v_listen_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- update_user_album
-- ---------------------------------------------------------------------------------------------

-- Edit the caller's collection record for an album without adding a listen. Every field is
-- replaced (NULL clears it). This is how a Shooting Star is added later.
-- Errors: not_authenticated 42501, not_in_collection P0002, invalid_rating 22023,
-- review_too_long 22023, invalid_shooting_star 22023.
create function public.update_user_album(
  p_album_id bigint,
  p_rating numeric,
  p_review text,
  p_shooting_star_recording_mbid uuid
)
returns public.user_albums
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_values record;
  v_row public.user_albums;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_row
  from public.user_albums ua
  where ua.user_id = v_uid and ua.album_id = p_album_id
  for update;
  if not found then
    raise exception 'not_in_collection' using errcode = 'P0002';
  end if;

  select * into v_values
  from private.validate_entry(v_uid, p_album_id, p_rating, p_review, p_shooting_star_recording_mbid);

  if (v_row.rating, v_row.review, v_row.shooting_star_recording_mbid, v_row.shooting_star_title)
     is distinct from
     (p_rating, v_values.o_review, p_shooting_star_recording_mbid, v_values.o_shooting_star_title) then
    update public.user_albums ua
    set rating = p_rating,
        review = v_values.o_review,
        shooting_star_recording_mbid = p_shooting_star_recording_mbid,
        shooting_star_title = v_values.o_shooting_star_title
    where ua.id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------------------------

-- The caller's own entry for an album (album page, prefilled log form). No row when signed out or
-- not logged.
create function public.get_user_album(p_album_id bigint)
returns table (
  id bigint,
  rating numeric,
  review text,
  shooting_star_recording_mbid uuid,
  shooting_star_title text,
  listen_count integer,
  first_listened_on date,
  last_listened_on date,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ua.id, ua.rating, ua.review, ua.shooting_star_recording_mbid, ua.shooting_star_title,
         l.listen_count, l.first_listened_on, l.last_listened_on, ua.created_at, ua.updated_at
  from public.user_albums ua
  cross join lateral (
    select count(*)::integer as listen_count, min(x.listened_on) as first_listened_on, max(x.listened_on) as last_listened_on
    from public.listens x
    where x.user_album_id = ua.id
  ) l
  where ua.user_id = auth.uid() and ua.album_id = p_album_id;
$$;

-- A user's albums (My Albums), one row per album, most recently listened first. Empty when the
-- user's content isn't visible to the caller (RLS). Keyset pagination: pass the last row's
-- last_listened_on and user_album_id to get the next page. lim is clamped to 1–100.
create function public.get_collection(
  p_username text,
  p_before_listened date default null,
  p_before_id bigint default null,
  p_lim integer default 48
)
returns table (
  user_album_id bigint,
  album_id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  first_release_date text,
  rating numeric,
  shooting_star_title text,
  listen_count integer,
  last_listened_on date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ua.id, ua.album_id, a.mbid, a.title, a.artist_credit, a.first_release_date,
         ua.rating, ua.shooting_star_title, l.listen_count, l.last_listened_on
  from public.profiles p
  join public.user_albums ua on ua.user_id = p.user_id
  join catalog.albums a on a.id = ua.album_id
  cross join lateral (
    select count(*)::integer as listen_count, max(x.listened_on) as last_listened_on
    from public.listens x
    where x.user_album_id = ua.id
  ) l
  where p.username = lower(btrim(p_username))
    and (p_before_listened is null or (l.last_listened_on, ua.id) < (p_before_listened, p_before_id))
  order by l.last_listened_on desc, ua.id desc
  limit least(greatest(coalesce(p_lim, 48), 1), 100);
$$;

-- A user's diary: every listen, newest first (listened_on, then created_at and id as stable
-- tie-breakers, PRD §6). Empty when the user's content isn't visible to the caller (RLS). Keyset
-- pagination: pass the last row's listened_on, created_at and listen_id. lim is clamped to 1–100.
create function public.get_diary(
  p_username text,
  p_before_listened date default null,
  p_before_created timestamptz default null,
  p_before_id bigint default null,
  p_lim integer default 50
)
returns table (
  listen_id bigint,
  listened_on date,
  note text,
  created_at timestamptz,
  album_id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  first_release_date text,
  rating numeric,
  shooting_star_title text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.listened_on, l.note, l.created_at, ua.album_id, a.mbid, a.title, a.artist_credit,
         a.first_release_date, ua.rating, ua.shooting_star_title
  from public.profiles p
  join public.listens l on l.user_id = p.user_id
  join public.user_albums ua on ua.id = l.user_album_id
  join catalog.albums a on a.id = ua.album_id
  where p.username = lower(btrim(p_username))
    and (p_before_listened is null
         or (l.listened_on, l.created_at, l.id) < (p_before_listened, p_before_created, p_before_id))
  order by l.listened_on desc, l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_lim, 50), 1), 100);
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.log_album(bigint, date, date, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.log_album(bigint, date, date, numeric, text, uuid, uuid) to authenticated;
revoke execute on function public.update_user_album(bigint, numeric, text, uuid) from public, anon;
grant execute on function public.update_user_album(bigint, numeric, text, uuid) to authenticated;

revoke execute on function public.get_user_album(bigint) from public;
grant execute on function public.get_user_album(bigint) to anon, authenticated;
revoke execute on function public.get_collection(text, date, bigint, integer) from public;
grant execute on function public.get_collection(text, date, bigint, integer) to anon, authenticated;
revoke execute on function public.get_diary(text, date, timestamptz, bigint, integer) from public;
grant execute on function public.get_diary(text, date, timestamptz, bigint, integer) to anon, authenticated;
