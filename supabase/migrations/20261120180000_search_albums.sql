-- Album search (PRD §7 "Search and ranking"): trigram word similarity on catalog.albums.search_text,
-- plus popularity and an album-type boost. Phase 1 spike: weights are starting points to tune.

create extension if not exists pg_trgm with schema extensions;

-- Phase 1 popularity proxy: number of URL relationships in the MusicBrainz dump (Wikidata,
-- AllMusic, Discogs, reviews…). Kept as a raw count so popularity can be recomputed while tuning.
alter table catalog.albums
  add column link_count integer not null default 0
    constraint albums_link_count_nonnegative check (link_count >= 0);

comment on column catalog.albums.link_count is 'URL relationships in the MusicBrainz dump. Phase 1 popularity input.';
comment on column catalog.albums.popularity is 'Ranking signal, 0–1. Phase 1: least(1, ln(1 + link_count) / ln(51)).';

-- Partial: retired albums are never searched.
create index albums_search_text_trgm_idx on catalog.albums
  using gin (search_text extensions.gin_trgm_ops)
  where not retired;

-- Tunable core. Not callable by clients (a tiny threshold would scan the whole catalog);
-- the eval script uses it to try weights without a migration.
--   score = word_similarity(query, search_text) * p_w_sim + popularity * p_w_pop + type_boost * p_w_type
--   type_boost = 1 for a studio album (primary type Album, no secondary types), else 0.
create function catalog.search_albums_weighted(
  p_q text,
  p_lim integer,
  p_w_sim real,
  p_w_pop real,
  p_w_type real,
  p_threshold real default 0.3
)
returns table (
  id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  primary_type text,
  secondary_types text[],
  first_release_date text,
  score real
)
language plpgsql
stable
set search_path = ''
-- Restored when the function exits, so the set_config below never leaks into the caller.
set pg_trgm.word_similarity_threshold = 0.3
as $$
#variable_conflict use_column
declare
  v_q text := catalog.normalize_text(p_q);
  v_lim integer := greatest(1, least(coalesce(p_lim, 20), 50));
begin
  if char_length(v_q) < 2 then
    return;
  end if;
  perform set_config('pg_trgm.word_similarity_threshold', greatest(coalesce(p_threshold, 0.3), 0.1)::text, true);

  return query
  select a.id, a.mbid, a.title, a.artist_credit, a.primary_type, a.secondary_types, a.first_release_date,
         (extensions.word_similarity(v_q, a.search_text) * p_w_sim
          + a.popularity * p_w_pop
          + (case when a.primary_type = 'Album' and cardinality(a.secondary_types) = 0 then 1 else 0 end) * p_w_type
         )::real
  from catalog.albums a
  where not a.retired
    and v_q operator(extensions.<%) a.search_text
  order by 8 desc, a.popularity desc, a.id -- 8 = the score column
  limit v_lim;
end;
$$;

-- Public search, called over RPC by web (and later mobile). Fixed starting weights from the PRD
-- (similarity 1.0, popularity 0.15, type 0.1). Security definer so clients don't need EXECUTE on
-- the tunable core; it only ever returns non-retired catalog rows, which are public anyway.
create function public.search_albums(q text, lim integer default 20)
returns table (
  id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  primary_type text,
  secondary_types text[],
  first_release_date text,
  score real
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from catalog.search_albums_weighted(q, lim, 1.0, 0.15, 0.1, 0.3);
$$;

comment on function public.search_albums(text, integer) is
  'Album search over the local catalog. Returns up to lim (1–50, default 20) non-retired albums, best first.';

revoke execute on function catalog.search_albums_weighted(text, integer, real, real, real, real) from public, anon, authenticated;
grant execute on function catalog.search_albums_weighted(text, integer, real, real, real, real) to service_role;

revoke execute on function public.search_albums(text, integer) from public;
grant execute on function public.search_albums(text, integer) to anon, authenticated, service_role;
