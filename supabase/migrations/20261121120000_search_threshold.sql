-- Search speed: raise the word-similarity threshold from 0.3 to 0.5.
-- At 0.3, short common-word queries ("green day", "all time low") matched ~65k albums and took
-- 6–8 s, past the 3 s statement timeout for anon. At 0.5 the eval's accuracy is unchanged
-- (80% top-1, same misses) and p95 drops from 7.5 s to 0.47 s (docs/search-spike.md).

-- Load pg_trgm's library in this session first. Until it's loaded, pg_trgm.* settings are
-- placeholders that only a superuser may set in a function's SET clause, and migrations on hosted
-- Supabase (and `supabase migration up`) don't run as superuser.
select extensions.word_similarity('load', 'pg_trgm');

create or replace function catalog.search_albums_weighted(
  p_q text,
  p_lim integer,
  p_w_sim real,
  p_w_pop real,
  p_w_type real,
  p_threshold real default 0.5
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
  select * from catalog.search_albums_weighted(q, lim, 1.0, 0.15, 0.1, 0.5);
$$;
