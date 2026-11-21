-- Live search fallback: add_live_albums() and live_search_due().
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(22);

select function_privs_are('public', 'add_live_albums', array['text', 'jsonb'], 'anon', array[]::text[], 'anon cannot add live albums');
select function_privs_are('public', 'add_live_albums', array['text', 'jsonb'], 'authenticated', array[]::text[], 'authenticated cannot add live albums');
select function_privs_are('public', 'live_search_due', array['text'], 'authenticated', array[]::text[], 'authenticated cannot call live_search_due');
select function_privs_are('public', 'add_live_albums', array['text', 'jsonb'], 'service_role', array['EXECUTE'], 'service_role can add live albums');

-- An album and artist already in the catalog (from the dump), and a known merge.
insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'Glimmerquist Classic', 'Glimmerquist', 'Album');
insert into catalog.artists (mbid, name, sort_name) values
  ('eeeeeeee-0000-4000-8000-0000000000b1', 'Glimmerquist', 'Glimmerquist');
insert into catalog.mbid_redirects (old_mbid, new_mbid, entity) values
  ('eeeeeeee-0000-4000-8000-000000000009', 'eeeeeeee-0000-4000-8000-000000000001', 'release_group');

create temp table payload on commit drop as select $$[
  {"mbid": "eeeeeeee-0000-4000-8000-000000000001", "title": "Renamed By Search", "artist_credit": "Glimmerquist",
   "primary_type": "Album", "secondary_types": [], "first_release_date": "2001", "credits": []},
  {"mbid": "eeeeeeee-0000-4000-8000-000000000002", "title": " Glimmerquist Brand New ", "artist_credit": "Glimmerquist & Plonth",
   "primary_type": "Album", "secondary_types": ["Live"], "first_release_date": "2026-11-20",
   "canonical_release_mbid": "eeeeeeee-0000-4000-8000-0000000000c2",
   "credits": [
     {"artist_mbid": "eeeeeeee-0000-4000-8000-0000000000b1", "name": "Glimmerquist", "sort_name": "Glimmerquist", "position": 0},
     {"artist_mbid": "eeeeeeee-0000-4000-8000-0000000000b2", "name": "Plonth", "sort_name": "", "disambiguation": "", "position": 1}
   ]},
  {"mbid": "eeeeeeee-0000-4000-8000-000000000003", "title": "Glimmerquist EP", "artist_credit": "Glimmerquist",
   "primary_type": "EP", "first_release_date": null, "credits": []},
  {"mbid": "eeeeeeee-0000-4000-8000-000000000004", "title": "Glimmerquist Single", "artist_credit": "Glimmerquist",
   "primary_type": "Single", "credits": []},
  {"mbid": "eeeeeeee-0000-4000-8000-000000000005", "title": "Glimmerquist Bad Date", "artist_credit": "Glimmerquist",
   "primary_type": "Album", "first_release_date": "soon", "credits": []},
  {"mbid": "eeeeeeee-0000-4000-8000-000000000009", "title": "Glimmerquist Merged Away", "artist_credit": "Glimmerquist",
   "primary_type": "Album", "credits": []}
]$$::jsonb as albums;
grant select on payload to anon, authenticated, service_role;

-- Clients cannot add albums.
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.add_live_albums('glimmerquist', (select albums from payload))$$, '42501', null, 'anon cannot add live albums');

set local role service_role;
select is(public.live_search_due('Glimmerquist'), true, 'a query never searched live is due');
select is(public.live_search_due('g'), false, 'a one-character query is never due');

select is(public.add_live_albums('Glimmerquist', (select albums from payload)), 2, 'adds only the new, valid Album/EP rows');

select is(
  (select title from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000001'),
  'Glimmerquist Classic', 'existing albums are not changed'
);
select is(
  (select source from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000001'),
  'dump', 'existing albums keep their source'
);
select ok(
  (select source = 'live' and title = 'Glimmerquist Brand New' and canonical_release_mbid = 'eeeeeeee-0000-4000-8000-0000000000c2'
          and secondary_types = array['Live'] and first_release_date = '2026-11-20'
   from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000002'),
  'a new album is stored as live, trimmed, with its provisional canonical release'
);
select is(
  (select first_release_date from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000003'),
  null, 'a null date is kept as null'
);
select ok(
  not exists (select 1 from catalog.albums where mbid in ('eeeeeeee-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000005')),
  'singles and bad dates are skipped'
);
select ok(
  not exists (select 1 from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000009'),
  'MBIDs merged away upstream are skipped'
);
select is(
  (select array_agg(ar.name order by aa.position)
   from catalog.album_artists aa join catalog.artists ar on ar.id = aa.artist_id
   join catalog.albums al on al.id = aa.album_id
   where al.mbid = 'eeeeeeee-0000-4000-8000-000000000002'),
  array['Glimmerquist', 'Plonth'], 'credits are stored in order, reusing the existing artist'
);
select is(
  (select sort_name from catalog.artists where mbid = 'eeeeeeee-0000-4000-8000-0000000000b2'),
  'Plonth', 'a new artist with a blank sort name falls back to the name'
);
select is(
  (select found from catalog.live_searches where query_key = 'glimmerquist'),
  2, 'the search is recorded under its normalized query'
);
select is(public.live_search_due('  GLIMMERQUIST '), false, 'the same query is not due again within a week');

select is(public.add_live_albums('Glimmerquist', (select albums from payload)), 0, 'adding the same results again adds nothing');
select ok(
  exists (select 1 from public.search_albums('glimmerquist brand new', 10) where mbid = 'eeeeeeee-0000-4000-8000-000000000002'),
  'live albums are found by search right away'
);

select throws_ok($$select public.add_live_albums('x', '{}'::jsonb)$$, '22023', 'invalid_albums', 'a non-array payload is refused');
select throws_ok(
  $$select public.add_live_albums('x', '[{"mbid": "not-a-uuid", "title": "T", "primary_type": "Album"}]'::jsonb)$$,
  '22023', 'invalid_albums', 'a malformed MBID is refused'
);

select * from finish();
rollback;
