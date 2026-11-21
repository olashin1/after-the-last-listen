-- Search tuning (Phase 1 spike, docs/search-spike.md "Change 2"). Top-1 on the 50-query eval: 88% → 94%.
--
-- 1. normalize_text() drops apostrophes and periods, so "sgt peppers" matches "Sgt. Pepper’s" and
--    "maad" matches "m.A.A.d". pg_trgm treats punctuation as a word break, so "pepper’s" used to be
--    the words "pepper" and "s". search_text is regenerated from the new normalization.
-- 2. Scoring adds full-string similarity (query vs the whole title + artist). word_similarity alone
--    rewards a query that matches one word inside a long title ("nevermnd" → "…Nevermore"); full
--    similarity prefers results that are mostly the query.
-- 3. Popularity weight 0.15 → 0.3, so originals beat same-titled tributes and covers more reliably.

-- Load pg_trgm's library first (see 20261121120000_search_threshold.sql).
select extensions.word_similarity('load', 'pg_trgm');

create or replace function catalog.normalize_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    btrim(regexp_replace(
      regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))), '[''’‘`.]', '', 'g'),
      '\s+', ' ', 'g')),
    '^the ', ''
  );
$$;

-- Recompute every stored search_text with the new normalization (rewrites the table and its indexes).
alter table catalog.albums alter column search_text set expression as (catalog.search_key(title, artist_credit));

-- New weight, so a new signature: replace the core.
drop function catalog.search_albums_weighted(text, integer, real, real, real, real);

-- Tunable core. Not callable by clients (a tiny threshold would scan the whole catalog).
--   score = word_similarity(q, search_text) * p_w_sim + similarity(q, search_text) * p_w_full
--         + popularity * p_w_pop + type_boost * p_w_type
--   type_boost = 1 for a studio album (primary type Album, no secondary types), else 0.
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
  score real
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
  select a.id, a.mbid, a.title, a.artist_credit, a.primary_type, a.secondary_types, a.first_release_date,
         (extensions.word_similarity(v_q, a.search_text) * p_w_sim
          + extensions.similarity(v_q, a.search_text) * coalesce(p_w_full, 0)
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

revoke execute on function catalog.search_albums_weighted(text, integer, real, real, real, real, real) from public, anon, authenticated;
grant execute on function catalog.search_albums_weighted(text, integer, real, real, real, real, real) to service_role;

-- Tuned weights: similarity 1.0, popularity 0.3, type 0.1, threshold 0.5, full similarity 0.1.
create or replace function public.search_albums(q text, lim integer default 20)
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
  select * from catalog.search_albums_weighted(q, lim, 1.0, 0.3, 0.1, 0.5, 0.1);
$$;
