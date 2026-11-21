-- search_albums(q, lim) and catalog.search_albums_weighted(): matching, ranking, limits, access.
-- Fixtures use invented words so the tests behave the same on an empty catalog or a full import.
begin;
select plan(33);

select has_function('public', 'search_albums', array['text', 'integer'], 'search_albums(text, integer) exists');
select is_definer('public', 'search_albums', array['text', 'integer'], 'search_albums runs as definer (clients never call the core)');

insert into catalog.albums (mbid, title, artist_credit, primary_type, secondary_types, popularity, retired) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'The Zorvex Side of the Moonbeam', 'Plinkrit Floyd', 'Album', '{}', 1.0, false),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'The Zorvex Side of the Moonbeam', 'Zorvex Tribute Quartet', 'Album', '{}', 0.0, false),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'The Zorvex Side of the Moonbeam', 'Plinkrit Floyd', 'Album', '{Live}', 1.0, false),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'Hōmōgenix Qwalt', 'Björqa', 'Album', '{}', 0.5, false),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'Qwabby Rhoad', 'The Qwabbles', 'Album', '{}', 0.8, false),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'Zzyqat Retired Gem', 'Gone Upstream', 'Album', '{}', 1.0, true),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'Vrontask Echoes', 'Vrontask', 'EP', '{}', 0.5, false),
  ('bbbbbbbb-0000-4000-8000-000000000008', 'Vrontask Echoes', 'Vrontask', 'Album', '{}', 0.5, false),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'Sgt. Plozzer’s Lonely Zinth Band', 'The Plozzles', 'Album', '{}', 0.5, false),
  ('bbbbbbbb-0000-4000-8000-000000000010', 'Sgt: Plozzers Lonely Zinth Band Remix Set', 'Plozzles', 'Album', '{}', 0.0, false);
insert into catalog.albums (mbid, title, artist_credit, primary_type)
  select gen_random_uuid(), 'Klampo Series ' || n, 'Klampo', 'Album' from generate_series(1, 60) n;

-- Rank (1 = first) of an album in the results for a query, or NULL if it's not returned.
create function pg_temp.rank_of(p_q text, p_mbid uuid) returns bigint language sql as $$
  select ordinality from public.search_albums(p_q, 50) with ordinality where mbid = p_mbid
$$;

-- Signed out: the public path.
set local role anon;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.rank_of('The Zorvex Side of the Moonbeam', 'bbbbbbbb-0000-4000-8000-000000000001'), 1::bigint, 'exact title: the original studio album is first');
select ok(
  pg_temp.rank_of('The Zorvex Side of the Moonbeam', 'bbbbbbbb-0000-4000-8000-000000000002')
    > pg_temp.rank_of('The Zorvex Side of the Moonbeam', 'bbbbbbbb-0000-4000-8000-000000000001'),
  'popularity: the original beats a tribute with the same title'
);
select ok(
  pg_temp.rank_of('The Zorvex Side of the Moonbeam', 'bbbbbbbb-0000-4000-8000-000000000003')
    > pg_temp.rank_of('The Zorvex Side of the Moonbeam', 'bbbbbbbb-0000-4000-8000-000000000001'),
  'type boost: the studio album beats the live album with the same title'
);
select is(pg_temp.rank_of('zorvx side of teh moonbeam', 'bbbbbbbb-0000-4000-8000-000000000001'), 1::bigint, 'typos still find the album');
select is(pg_temp.rank_of('zorvex side', 'bbbbbbbb-0000-4000-8000-000000000001'), 1::bigint, 'a partial title finds the album');
select is(pg_temp.rank_of('ZORVEX SIDE OF THE MOONBEAM', 'bbbbbbbb-0000-4000-8000-000000000001'), 1::bigint, 'search is case-insensitive');
select is(pg_temp.rank_of('homogenix qwalt', 'bbbbbbbb-0000-4000-8000-000000000004'), 1::bigint, 'accents in the title are ignored');
select is(pg_temp.rank_of('Hōmōgenix Björqa', 'bbbbbbbb-0000-4000-8000-000000000004'), 1::bigint, 'accents in the query are ignored');
select is(pg_temp.rank_of('qwabby rhoad', 'bbbbbbbb-0000-4000-8000-000000000005'), 1::bigint, 'title only');
select is(pg_temp.rank_of('qwabby rhoad qwabbles', 'bbbbbbbb-0000-4000-8000-000000000005'), 1::bigint, 'title then artist');
select is(pg_temp.rank_of('qwabbles qwabby rhoad', 'bbbbbbbb-0000-4000-8000-000000000005'), 1::bigint, 'artist then title');
select is(pg_temp.rank_of('the qwabbles qwabby rhoad', 'bbbbbbbb-0000-4000-8000-000000000005'), 1::bigint, 'a leading "the" in the query is ignored');
select is(pg_temp.rank_of('sgt plozzers lonely zinth band', 'bbbbbbbb-0000-4000-8000-000000000009'), 1::bigint, 'apostrophes and periods are ignored: the real title beats a variant spelled like the query');
select is(pg_temp.rank_of('sgt plozzer''s lonely zinth band', 'bbbbbbbb-0000-4000-8000-000000000009'), 1::bigint, 'an apostrophe in the query is ignored too');
select is(pg_temp.rank_of('Zzyqat Retired Gem', 'bbbbbbbb-0000-4000-8000-000000000006'), null::bigint, 'retired albums are never returned');
select ok(
  pg_temp.rank_of('vrontask echoes', 'bbbbbbbb-0000-4000-8000-000000000008')
    < pg_temp.rank_of('vrontask echoes', 'bbbbbbbb-0000-4000-8000-000000000007'),
  'type boost: an album beats an EP with the same title and popularity'
);
select ok(
  (select bool_and(score >= next_score) from (
     select score, lead(score) over (order by ordinality) as next_score
     from public.search_albums('zorvex side of the moonbeam', 50) with ordinality
   ) s where next_score is not null),
  'results are ordered by score, best first'
);
select ok(
  (select bool_and(title is not null and artist_credit is not null and primary_type is not null)
   from public.search_albums('zorvex', 10)),
  'results include title, artist credit and type'
);

-- Limits.
select is((select count(*)::int from public.search_albums('klampo series', 5)), 5, 'lim caps the number of results');
select is((select count(*)::int from public.search_albums('klampo series')), 20, 'lim defaults to 20');
select is((select count(*)::int from public.search_albums('klampo series', 1000)), 50, 'lim is clamped to 50');
select is((select count(*)::int from public.search_albums('klampo series', 0)), 1, 'lim below 1 is treated as 1');
select is((select count(*)::int from public.search_albums('klampo series', null)), 20, 'a NULL lim uses the default');

-- Queries too short to search.
select is((select count(*)::int from public.search_albums('')), 0, 'an empty query returns nothing');
select is((select count(*)::int from public.search_albums('   ')), 0, 'a blank query returns nothing');
select is((select count(*)::int from public.search_albums('a')), 0, 'a one-character query returns nothing');
select is((select count(*)::int from public.search_albums(null)), 0, 'a NULL query returns nothing');

-- Access.
select throws_ok(
  $$select * from catalog.search_albums_weighted('zorvex', 10, 1, 0, 0, 0.0)$$,
  '42501', null,
  'anon cannot call the tunable core (e.g. with a tiny threshold)'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(pg_temp.rank_of('qwabby rhoad', 'bbbbbbbb-0000-4000-8000-000000000005'), 1::bigint, 'signed-in users can search');
select throws_ok(
  $$select * from catalog.search_albums_weighted('zorvex', 10, 1, 0, 0)$$,
  '42501', null,
  'signed-in users cannot call the tunable core'
);

-- The eval script's path: different weights change the ranking.
set local role service_role;
select is(
  (select count(distinct score)::int from catalog.search_albums_weighted('the zorvex side of the moonbeam', 50, 1, 0, 0)
   where mbid in ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003')),
  1,
  'with popularity, type and full-similarity weights at 0, same-title albums tie on similarity'
);

select * from finish();
rollback;
