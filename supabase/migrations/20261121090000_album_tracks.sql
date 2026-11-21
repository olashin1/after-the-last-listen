-- Album pages (PRD §6 catalog.tracks, §7 "Tracklists and artwork"): tracklists load on demand.
-- The first time an album page opens, the web server fetches the canonical release's tracks from
-- the MusicBrainz API (through the rate-limited adapter) and stores them with set_album_tracks().
-- Artwork needs no storage: Cover Art Archive images are addressed by release-group MBID.

-- Which release the stored tracks came from. When the canonical release changes (canonical dumps
-- are refreshed twice a month), tracks_release_mbid no longer matches and the page reloads them.
alter table catalog.albums add column tracks_release_mbid uuid;
comment on column catalog.albums.tracks_release_mbid is 'Release whose tracklist is stored in catalog.tracks. Set by set_album_tracks().';
comment on column catalog.albums.tracks_loaded_at is 'When catalog.tracks was last filled for this album. Set by set_album_tracks().';

create table catalog.tracks (
  album_id bigint not null references catalog.albums (id),
  disc_number smallint not null constraint tracks_disc_number_positive check (disc_number >= 1),
  position smallint not null constraint tracks_position_positive check (position >= 1),
  -- Stable across editions; the Shooting Star (Phase 3) references this.
  recording_mbid uuid not null,
  title text not null constraint tracks_title_not_blank check (btrim(title) <> ''),
  length_ms integer constraint tracks_length_nonnegative check (length_ms >= 0),
  primary key (album_id, disc_number, position)
);

comment on table catalog.tracks is
  'Tracklist of each album''s canonical release, loaded on demand. Rows are a cache of upstream data and are replaced as a whole by set_album_tracks().';

create index tracks_recording_mbid_idx on catalog.tracks (recording_mbid);

alter table catalog.tracks enable row level security;
create policy "Catalog tracks are readable by everyone" on catalog.tracks
  for select to anon, authenticated using (true);

revoke all on catalog.tracks from public, anon, authenticated, service_role;
grant select on catalog.tracks to anon, authenticated;
-- Tracks are a replaceable cache (not referenced by our own IDs), so the service role may delete them
-- when a tracklist is reloaded. Albums and artists still can't be deleted.
grant select, insert, delete on catalog.tracks to service_role;

-- Replace an album's tracklist. Called by the web server with the service role key, right after
-- fetching the release from MusicBrainz. In `public` so supabase-js can call it over RPC, but
-- executable only by the service role.
-- p_tracks: [{disc_number, position, recording_mbid, title, length_ms}, …]
-- Errors (message / SQLSTATE): album_not_found P0002, release_mismatch 22023 (the canonical release
-- changed while the tracks were being fetched), invalid_tracks 22023.
create function public.set_album_tracks(p_album_id bigint, p_release_mbid uuid, p_tracks jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_canonical uuid;
  v_count integer;
begin
  -- Row lock: two visitors loading the same album at once write one after the other.
  select canonical_release_mbid into v_canonical from catalog.albums where id = p_album_id for update;
  if not found then
    raise exception 'album_not_found' using errcode = 'P0002';
  end if;
  if v_canonical is distinct from p_release_mbid then
    raise exception 'release_mismatch' using errcode = '22023';
  end if;
  if p_tracks is null or jsonb_typeof(p_tracks) <> 'array' or jsonb_array_length(p_tracks) = 0 then
    raise exception 'invalid_tracks' using errcode = '22023';
  end if;

  delete from catalog.tracks where album_id = p_album_id;
  begin
    insert into catalog.tracks (album_id, disc_number, position, recording_mbid, title, length_ms)
    select p_album_id, t.disc_number, t.position, t.recording_mbid, btrim(t.title), t.length_ms
    from jsonb_to_recordset(p_tracks)
      as t(disc_number smallint, position smallint, recording_mbid uuid, title text, length_ms integer);
    get diagnostics v_count = row_count;
  exception
    when check_violation or not_null_violation or unique_violation or invalid_text_representation then
      raise exception 'invalid_tracks' using errcode = '22023';
  end;

  update catalog.albums
  set tracks_loaded_at = now(), tracks_release_mbid = p_release_mbid
  where id = p_album_id;

  return v_count;
end;
$$;

-- One album for the album page. Retired albums are still returned (they keep working for anyone
-- who logged them). tracks_current: the stored tracklist belongs to the current canonical release.
create function public.get_album(p_album_id bigint)
returns table (
  id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  primary_type text,
  secondary_types text[],
  first_release_date text,
  canonical_release_mbid uuid,
  tracks_current boolean,
  retired boolean
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.mbid, a.title, a.artist_credit, a.primary_type, a.secondary_types, a.first_release_date,
         a.canonical_release_mbid,
         a.tracks_loaded_at is not null and a.tracks_release_mbid is not distinct from a.canonical_release_mbid,
         a.retired
  from catalog.albums a
  where a.id = p_album_id;
$$;

-- The stored tracklist, first track of the first disc first.
create function public.get_album_tracks(p_album_id bigint)
returns table (disc_number smallint, "position" smallint, title text, length_ms integer, recording_mbid uuid)
language sql
stable
set search_path = ''
as $$
  select t.disc_number, t.position, t.title, t.length_ms, t.recording_mbid
  from catalog.tracks t
  where t.album_id = p_album_id
  order by t.disc_number, t.position;
$$;

revoke execute on function public.set_album_tracks(bigint, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_album_tracks(bigint, uuid, jsonb) to service_role;

revoke execute on function public.get_album(bigint) from public;
grant execute on function public.get_album(bigint) to anon, authenticated, service_role;
revoke execute on function public.get_album_tracks(bigint) from public;
grant execute on function public.get_album_tracks(bigint) to anon, authenticated, service_role;
