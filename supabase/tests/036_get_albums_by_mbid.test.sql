-- get_albums_by_mbid(): the landing page's curated albums, looked up by MBID.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(7);

insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('ffffffff-0000-4000-8000-000000000001', 'Velvet Orchard', 'Tamsin Rowe', 'Album'),
  ('ffffffff-0000-4000-8000-000000000002', 'Copper Lanterns', 'The Halvers', 'Album'),
  ('ffffffff-0000-4000-8000-000000000003', 'Lost Signal', 'The Halvers', 'Album');
update catalog.albums set retired = true where mbid = 'ffffffff-0000-4000-8000-000000000003';
-- A merged album pointing at Copper Lanterns.
insert into catalog.albums (mbid, title, artist_credit, primary_type, retired, merged_into_id)
select 'ffffffff-0000-4000-8000-000000000004', 'Copper Lanterns (dupe)', 'The Halvers', 'Album', true, id
from catalog.albums where mbid = 'ffffffff-0000-4000-8000-000000000002';

select function_privs_are('public', 'get_albums_by_mbid', array['uuid[]'], 'anon', array['EXECUTE'], 'anon can execute get_albums_by_mbid');

set local role anon;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$select title from public.get_albums_by_mbid(array[
      'ffffffff-0000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000001']::uuid[])$$,
  $$values ('Copper Lanterns'::text), ('Velvet Orchard'::text)$$,
  'albums come back in the order given'
);
select results_eq(
  $$select title from public.get_albums_by_mbid(array[
      'ffffffff-0000-4000-8000-0000000000ff', 'ffffffff-0000-4000-8000-000000000003', 'ffffffff-0000-4000-8000-000000000001']::uuid[])$$,
  $$values ('Velvet Orchard'::text)$$,
  'unknown and retired albums are skipped'
);
select results_eq(
  $$select title from public.get_albums_by_mbid(array['ffffffff-0000-4000-8000-000000000004']::uuid[])$$,
  $$values ('Copper Lanterns'::text)$$,
  'a merged album resolves to its survivor'
);
select is(
  (select count(*)::int from public.get_albums_by_mbid(array[
      'ffffffff-0000-4000-8000-000000000004', 'ffffffff-0000-4000-8000-000000000002']::uuid[])),
  1, 'an album and a merged duplicate of it appear once'
);
select is(
  (select count(*)::int from public.get_albums_by_mbid(
      (select array_agg('ffffffff-0000-4000-8000-000000000001'::uuid) from generate_series(1, 30)) ||
      array['ffffffff-0000-4000-8000-000000000002']::uuid[])),
  1, 'only the first 24 MBIDs are read'
);
select is((select count(*)::int from public.get_albums_by_mbid(array[]::uuid[])), 0, 'an empty list returns nothing');

select * from finish();
rollback;
