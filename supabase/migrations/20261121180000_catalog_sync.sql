-- Phase 2 catalog sync (PRD §7 "Sync pipeline", §6 "ID rules"): retire albums that vanish upstream,
-- follow MBID merges, and add brand-new releases found by the live search fallback.
--
-- How the pieces fit (docs/decisions.md, 2026-11-21):
--   * The weekly sync (packages/worker, `pnpm catalog:sync`) upserts the release-group dump and records
--     albums missing from it in catalog.sync_vanished.
--   * It then looks each vanished album up in the MusicBrainz API: a different MBID back means a merge
--     (apply_album_redirect), a 404 or a type that's no longer Album/EP means retire (retire_album).
--   * The web app's live search fallback inserts new releases with add_live_albums().
-- Rows are still never deleted: merged albums are retired and point at the survivor.

-- Load pg_trgm's library first (see 20261121120000_search_threshold.sql).
select extensions.word_similarity('load', 'pg_trgm');

-- ---------------------------------------------------------------------------------------------
-- Album columns
-- ---------------------------------------------------------------------------------------------

alter table catalog.albums
  -- 'dump': from the release-group dump. 'live': added by the live search fallback and not yet seen
  -- in a dump, so a dump older than the album can't make it look vanished.
  add column source text not null default 'dump' constraint albums_source check (source in ('dump', 'live')),
  add column created_at timestamptz not null default now(),
  -- Set when this album was merged into another upstream. The row is retired; the page redirects.
  add column merged_into_id bigint references catalog.albums (id);

alter table catalog.albums
  add constraint albums_merged_into_not_self check (merged_into_id <> id),
  -- Merged albums are always retired.
  add constraint albums_merged_is_retired check (merged_into_id is null or retired);

create index albums_merged_into_id_idx on catalog.albums (merged_into_id) where merged_into_id is not null;

comment on column catalog.albums.source is 'dump: from the release-group dump. live: added by the live search fallback, not yet in a dump.';
comment on column catalog.albums.merged_into_id is 'Merged upstream into this album (MBID redirect). Always retired.';

-- ---------------------------------------------------------------------------------------------
-- Sync bookkeeping (service role only)
-- ---------------------------------------------------------------------------------------------

create table catalog.sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' constraint sync_runs_status check (status in ('running', 'succeeded', 'failed')),
  dump_date text,
  canonical_folder text,
  counts jsonb not null default '{}',
  error text
);
comment on table catalog.sync_runs is 'One row per catalog sync: when, which dumps, row counts, and the error if it failed.';

-- Albums missing from the latest dump, waiting for an API lookup (merge, deletion or dump lag).
create table catalog.sync_vanished (
  album_id bigint primary key references catalog.albums (id),
  run_id bigint not null references catalog.sync_runs (id),
  found_at timestamptz not null default now()
);

-- Live search fallback: when each weak query last went to MusicBrainz, so it goes at most weekly.
create table catalog.live_searches (
  query_key text primary key,
  searched_at timestamptz not null default now(),
  found integer not null default 0
);

alter table catalog.sync_runs enable row level security;
alter table catalog.sync_vanished enable row level security;
alter table catalog.live_searches enable row level security;
-- No policies: clients have no grants on these tables; the service role bypasses RLS.

revoke all on catalog.sync_runs, catalog.sync_vanished, catalog.live_searches from public, anon, authenticated, service_role;
grant select, insert, update on catalog.sync_runs to service_role;
grant select, insert, update, delete on catalog.sync_vanished, catalog.live_searches to service_role;
grant usage on all sequences in schema catalog to service_role;
-- Redirects can be re-pointed when a survivor is itself merged later (A → B, then B → C).
grant update on catalog.mbid_redirects to service_role;

-- ---------------------------------------------------------------------------------------------
-- Merges and retirement (called by the sync worker)
-- ---------------------------------------------------------------------------------------------

-- Old release-group MBID p_old was merged into p_new upstream. Returns what happened:
--   'merged'  : p_new is already in the catalog; the old row is retired and points at it.
--   'renamed' : p_new isn't in the catalog yet; the old row takes the new MBID and keeps our ID.
--   'unknown' : no album has p_old (the redirect is still recorded).
-- Either way user data stays attached: our IDs never change. (Phase 3: also move user_albums and
-- favorites from a merged album to its survivor.)
create function catalog.apply_album_redirect(p_old uuid, p_new uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_id bigint;
  v_survivor_id bigint;
begin
  if p_old is null or p_new is null or p_old = p_new then
    raise exception 'invalid_redirect' using errcode = '22023';
  end if;

  insert into catalog.mbid_redirects (old_mbid, new_mbid, entity)
  values (p_old, p_new, 'release_group')
  on conflict (old_mbid) do update set new_mbid = excluded.new_mbid
    where catalog.mbid_redirects.new_mbid is distinct from excluded.new_mbid;

  select id into v_old_id from catalog.albums where mbid = p_old for update;
  if not found then
    return 'unknown';
  end if;
  delete from catalog.sync_vanished where album_id = v_old_id;

  -- The survivor, following its own merge if it was merged too.
  select coalesce(merged_into_id, id) into v_survivor_id from catalog.albums where mbid = p_new for update;
  if not found then
    update catalog.albums set mbid = p_new, retired = false, merged_into_id = null where id = v_old_id;
    return 'renamed';
  end if;

  update catalog.albums set retired = true, merged_into_id = v_survivor_id where id = v_old_id;
  -- Albums merged into the old one earlier now point straight at the survivor.
  update catalog.albums set merged_into_id = v_survivor_id where merged_into_id = v_old_id;
  return 'merged';
end;
$$;

-- Gone upstream (deleted, or no longer an Album/EP): hide from search, keep the row.
create function catalog.retire_album(p_album_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  update catalog.albums set retired = true where id = p_album_id and not retired;
  delete from catalog.sync_vanished where album_id = p_album_id;
$$;

revoke execute on function catalog.apply_album_redirect(uuid, uuid), catalog.retire_album(bigint) from public, anon, authenticated;
grant execute on function catalog.apply_album_redirect(uuid, uuid), catalog.retire_album(bigint) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Live search fallback (called by the web server with the service role key)
-- ---------------------------------------------------------------------------------------------

-- True when query q may go to MusicBrainz: long enough, and not sent in the last 7 days.
create function public.live_search_due(q text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select char_length(catalog.normalize_text(q)) >= 2
     and not exists (
       select 1 from catalog.live_searches
       where query_key = catalog.normalize_text(q) and searched_at > now() - interval '7 days'
     );
$$;

-- Add albums found by a live MusicBrainz search for query p_query, and record the search.
-- Existing albums are never changed (the dump stays the source of truth), and MBIDs known to be
-- merged away are skipped. Rows with a type other than Album/EP, a blank title or a bad date are
-- skipped. Returns how many albums were added.
-- p_albums: [{mbid, title, artist_credit, primary_type, secondary_types[], first_release_date,
--             canonical_release_mbid, credits: [{artist_mbid, name, sort_name, disambiguation, position}]}]
-- Errors: invalid_albums 22023 (not an array, or a malformed MBID).
create function public.add_live_albums(p_query text, p_albums jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_added integer := 0;
begin
  if p_albums is null or jsonb_typeof(p_albums) <> 'array' then
    raise exception 'invalid_albums' using errcode = '22023';
  end if;

  begin
    create temp table live_in on commit drop as
    select a.mbid::uuid as mbid, btrim(a.title) as title, coalesce(btrim(a.artist_credit), '') as artist_credit,
           a.primary_type, coalesce(array(select jsonb_array_elements_text(a.secondary_types)), '{}') as secondary_types,
           nullif(a.first_release_date, '') as first_release_date, a.canonical_release_mbid::uuid as canonical_release_mbid,
           coalesce(a.credits, '[]') as credits
    from jsonb_to_recordset(p_albums) as a(
      mbid text, title text, artist_credit text, primary_type text, secondary_types jsonb,
      first_release_date text, canonical_release_mbid text, credits jsonb
    )
    where a.primary_type in ('Album', 'EP')
      and coalesce(btrim(a.title), '') <> ''
      and (nullif(a.first_release_date, '') is null or a.first_release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$');

    create temp table live_credits on commit drop as
    select l.mbid as album_mbid, c.artist_mbid::uuid as artist_mbid, btrim(c.name) as name,
           coalesce(nullif(btrim(c.sort_name), ''), btrim(c.name)) as sort_name,
           nullif(btrim(c.disambiguation), '') as disambiguation, c.position
    from live_in l,
         jsonb_to_recordset(case when jsonb_typeof(l.credits) = 'array' then l.credits else '[]' end)
           as c(artist_mbid text, name text, sort_name text, disambiguation text, position smallint)
    where coalesce(btrim(c.name), '') <> '' and c.position >= 0;
  exception
    when invalid_text_representation or datatype_mismatch then
      raise exception 'invalid_albums' using errcode = '22023';
  end;

  -- Artists first (credits need them). Only for albums that will be added; existing artists stay as they are.
  insert into catalog.artists (mbid, name, sort_name, disambiguation)
  select distinct on (c.artist_mbid) c.artist_mbid, c.name, c.sort_name, c.disambiguation
  from live_credits c
  where not exists (select 1 from catalog.albums al where al.mbid = c.album_mbid)
  order by c.artist_mbid
  on conflict (mbid) do nothing;

  create temp table live_added (id bigint, mbid uuid) on commit drop;
  with added as (
    insert into catalog.albums (mbid, title, artist_credit, primary_type, secondary_types, first_release_date,
                                canonical_release_mbid, source)
    select distinct on (l.mbid) l.mbid, l.title, l.artist_credit, l.primary_type, l.secondary_types,
           l.first_release_date, l.canonical_release_mbid, 'live'
    from live_in l
    where not exists (select 1 from catalog.mbid_redirects r where r.old_mbid = l.mbid)
    order by l.mbid
    on conflict (mbid) do nothing
    returning id, mbid
  )
  insert into live_added select id, mbid from added;
  get diagnostics v_added = row_count;

  -- Credits for the albums just added.
  insert into catalog.album_artists (album_id, artist_id, position)
  select distinct on (a.id, ar.id) a.id, ar.id, c.position
  from live_credits c
  join live_added a on a.mbid = c.album_mbid
  join catalog.artists ar on ar.mbid = c.artist_mbid
  order by a.id, ar.id, c.position
  on conflict do nothing;

  insert into catalog.live_searches (query_key, searched_at, found)
  values (catalog.normalize_text(p_query), now(), v_added)
  on conflict (query_key) do update set searched_at = excluded.searched_at, found = excluded.found;

  drop table live_added;
  drop table live_credits;
  drop table live_in;
  return v_added;
end;
$$;

revoke execute on function public.live_search_due(text), public.add_live_albums(text, jsonb) from public, anon, authenticated;
grant execute on function public.live_search_due(text), public.add_live_albums(text, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Search returns the text match, so the fallback can tell a weak result from a popular one
-- ---------------------------------------------------------------------------------------------

drop function public.search_albums(text, integer);
drop function catalog.search_albums_weighted(text, integer, real, real, real, real, real);

-- Same scoring as 20261121150000_search_tuning.sql, plus `match`: word_similarity(q, search_text).
create function catalog.search_albums_weighted(
  p_q text,
  p_lim integer,
  p_w_sim real,
  p_w_pop real,
  p_w_type real,
  p_threshold real default 0.5,
  p_w_full real default 0
)
returns table (
  id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  primary_type text,
  secondary_types text[],
  first_release_date text,
  score real,
  match real
)
language plpgsql
stable
set search_path = ''
-- Restored when the function exits, so the set_config below never leaks into the caller.
set pg_trgm.word_similarity_threshold = 0.5
as $$
#variable_conflict use_column
declare
  v_q text := catalog.normalize_text(p_q);
  v_lim integer := greatest(1, least(coalesce(p_lim, 20), 50));
begin
  if char_length(v_q) < 2 then
    return;
  end if;
  perform set_config('pg_trgm.word_similarity_threshold', greatest(coalesce(p_threshold, 0.5), 0.1)::text, true);

  return query
  select s.id, s.mbid, s.title, s.artist_credit, s.primary_type, s.secondary_types, s.first_release_date,
         (s.word_sim * p_w_sim
          + s.full_sim * coalesce(p_w_full, 0)
          + s.popularity * p_w_pop
          + (case when s.primary_type = 'Album' and cardinality(s.secondary_types) = 0 then 1 else 0 end) * p_w_type
         )::real,
         s.word_sim::real
  from (
    select a.id, a.mbid, a.title, a.artist_credit, a.primary_type, a.secondary_types, a.first_release_date, a.popularity,
           extensions.word_similarity(v_q, a.search_text) as word_sim,
           extensions.similarity(v_q, a.search_text) as full_sim
    from catalog.albums a
    where not a.retired
      and v_q operator(extensions.<%) a.search_text
  ) s
  order by 8 desc, s.popularity desc, s.id -- 8 = the score column
  limit v_lim;
end;
$$;

revoke execute on function catalog.search_albums_weighted(text, integer, real, real, real, real, real) from public, anon, authenticated;
grant execute on function catalog.search_albums_weighted(text, integer, real, real, real, real, real) to service_role;

-- Tuned weights unchanged: similarity 1.0, popularity 0.3, type 0.1, threshold 0.5, full similarity 0.1.
create function public.search_albums(q text, lim integer default 20)
returns table (
  id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  primary_type text,
  secondary_types text[],
  first_release_date text,
  score real,
  match real
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from catalog.search_albums_weighted(q, lim, 1.0, 0.3, 0.1, 0.5, 0.1);
$$;

revoke execute on function public.search_albums(text, integer) from public;
grant execute on function public.search_albums(text, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- get_album: add merged_into_id so the album page can redirect to the survivor
-- ---------------------------------------------------------------------------------------------

drop function public.get_album(bigint);

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
  retired boolean,
  merged_into_id bigint
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.mbid, a.title, a.artist_credit, a.primary_type, a.secondary_types, a.first_release_date,
         a.canonical_release_mbid,
         a.tracks_loaded_at is not null and a.tracks_release_mbid is not distinct from a.canonical_release_mbid,
         a.retired,
         a.merged_into_id
  from catalog.albums a
  where a.id = p_album_id;
$$;

revoke execute on function public.get_album(bigint) from public;
grant execute on function public.get_album(bigint) to anon, authenticated, service_role;
