-- Catalog layer (PRD §6): a read-only, slim copy of MusicBrainz album data.
-- Everyone can read it; only the service role (sync worker / import script) writes it.
-- Our own bigint IDs are the keys; MBIDs live in unique columns.
-- Catalog artists and albums are never deleted (set retired = true), enforced below by grants and triggers.
-- Not here yet: catalog.tracks (Phase 2, on-demand tracklists) and the trigram index (search_albums task).

create extension if not exists unaccent with schema extensions;

create schema catalog;
comment on schema catalog is 'Read-only MusicBrainz album data. Written only by the service role. Rows are retired, never deleted.';

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- PRD §7 normalization: lowercase, unaccented, leading "the" removed, whitespace collapsed.
-- Applied to the title and the artist credit separately, so "The Beatles" also becomes "beatles".
-- Declared immutable so it can drive a generated column; unaccent is called with an explicit
-- dictionary, which is the documented way to make that safe.
create function catalog.normalize_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))), '\s+', ' ', 'g')),
    '^the ', ''
  );
$$;

create function catalog.search_key(p_title text, p_artist_credit text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(catalog.normalize_text(p_title) || ' ' || catalog.normalize_text(p_artist_credit));
$$;

create function catalog.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Blocks DELETE and TRUNCATE on artists and albums for every role, including the table owner.
create function catalog.prevent_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'catalog % rows are never deleted; set retired = true instead', tg_table_name
    using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table catalog.artists (
  id bigint generated always as identity primary key,
  mbid uuid not null constraint artists_mbid_key unique,
  name text not null constraint artists_name_not_blank check (btrim(name) <> ''),
  sort_name text not null,
  disambiguation text,
  retired boolean not null default false,
  updated_at timestamptz not null default now()
);

create table catalog.albums (
  id bigint generated always as identity primary key,
  -- MusicBrainz release group: the album as people think of it, not a pressing or edition.
  mbid uuid not null constraint albums_mbid_key unique,
  title text not null constraint albums_title_not_blank check (btrim(title) <> ''),
  -- Display string for the credit, e.g. "Simon & Garfunkel". Structured credits are in album_artists.
  artist_credit text not null,
  -- PRD §7 import filter: only albums and EPs. Live, compilation, soundtrack etc. are secondary types.
  primary_type text not null constraint albums_primary_type check (primary_type in ('Album', 'EP')),
  secondary_types text[] not null default '{}',
  -- MusicBrainz dates can be partial: YYYY, YYYY-MM or YYYY-MM-DD. Sorts correctly as text.
  first_release_date text
    constraint albums_first_release_date_format check (first_release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  canonical_release_mbid uuid,
  release_count integer not null default 0 constraint albums_release_count_nonnegative check (release_count >= 0),
  popularity double precision not null default 0,
  search_text text not null generated always as (catalog.search_key(title, artist_credit)) stored,
  tracks_loaded_at timestamptz,
  retired boolean not null default false,
  updated_at timestamptz not null default now()
);

create index albums_popularity_idx on catalog.albums (popularity desc);

create table catalog.album_artists (
  album_id bigint not null references catalog.albums (id),
  artist_id bigint not null references catalog.artists (id),
  -- Order within the credit, starting at 0.
  position smallint not null constraint album_artists_position_nonnegative check (position >= 0),
  primary key (album_id, artist_id),
  constraint album_artists_album_position_key unique (album_id, position)
);

create index album_artists_artist_id_idx on catalog.album_artists (artist_id);

-- Upstream merges: old_mbid now redirects to new_mbid. MBIDs are globally unique, so old_mbid is the key.
create table catalog.mbid_redirects (
  old_mbid uuid primary key,
  new_mbid uuid not null,
  entity text not null constraint mbid_redirects_entity check (entity in ('artist', 'release_group', 'recording')),
  created_at timestamptz not null default now(),
  constraint mbid_redirects_not_self check (old_mbid <> new_mbid)
);

create index mbid_redirects_new_mbid_idx on catalog.mbid_redirects (new_mbid);

comment on column catalog.albums.search_text is 'Generated by catalog.search_key(title, artist_credit). Searched by search_albums().';
comment on column catalog.albums.canonical_release_mbid is 'From the MusicBrainz canonical release mapping; its tracklist is shown.';
comment on column catalog.albums.retired is 'Gone upstream: hidden from search, still works for anyone who logged it.';

create trigger artists_touch_updated_at before update on catalog.artists
  for each row execute function catalog.touch_updated_at();
create trigger albums_touch_updated_at before update on catalog.albums
  for each row execute function catalog.touch_updated_at();

create trigger artists_prevent_delete before delete on catalog.artists
  for each statement execute function catalog.prevent_delete();
create trigger artists_prevent_truncate before truncate on catalog.artists
  for each statement execute function catalog.prevent_delete();
create trigger albums_prevent_delete before delete on catalog.albums
  for each statement execute function catalog.prevent_delete();
create trigger albums_prevent_truncate before truncate on catalog.albums
  for each statement execute function catalog.prevent_delete();

-- ---------------------------------------------------------------------------------------------
-- Access: readable by everyone, writable only by the service role
-- ---------------------------------------------------------------------------------------------

alter table catalog.artists enable row level security;
alter table catalog.albums enable row level security;
alter table catalog.album_artists enable row level security;
alter table catalog.mbid_redirects enable row level security;

create policy "Catalog artists are readable by everyone" on catalog.artists
  for select to anon, authenticated using (true);
create policy "Catalog albums are readable by everyone" on catalog.albums
  for select to anon, authenticated using (true);
create policy "Catalog album credits are readable by everyone" on catalog.album_artists
  for select to anon, authenticated using (true);
create policy "Catalog MBID redirects are readable by everyone" on catalog.mbid_redirects
  for select to anon, authenticated using (true);

revoke all on schema catalog from public;
grant usage on schema catalog to anon, authenticated, service_role;

revoke all on all tables in schema catalog from public, anon, authenticated, service_role;
grant select on all tables in schema catalog to anon, authenticated;

-- The service role bypasses RLS, so grants are its only limit. No DELETE on artists and albums
-- (retire instead). Album credits can be rewritten when upstream changes them.
grant select, insert, update on catalog.artists, catalog.albums, catalog.mbid_redirects to service_role;
grant select, insert, update, delete on catalog.album_artists to service_role;
grant usage on all sequences in schema catalog to service_role;

revoke execute on all functions in schema catalog from public;
grant execute on function catalog.normalize_text(text), catalog.search_key(text, text)
  to anon, authenticated, service_role;
