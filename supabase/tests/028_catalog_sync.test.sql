-- Catalog sync: sync bookkeeping tables, apply_album_redirect(), retire_album(), search's match
-- column and get_album's merged_into_id.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(37);

-- Structure and access ---------------------------------------------------------------------------
select has_table('catalog', 'sync_runs', 'catalog.sync_runs exists');
select has_table('catalog', 'sync_vanished', 'catalog.sync_vanished exists');
select has_table('catalog', 'live_searches', 'catalog.live_searches exists');
select col_default_is('catalog', 'albums', 'source', 'dump'::text, 'albums.source defaults to dump');
select has_column('catalog', 'albums', 'merged_into_id', 'albums.merged_into_id exists');

select table_privs_are('catalog', 'sync_runs', 'anon', array[]::text[], 'anon: no access to sync_runs');
select table_privs_are('catalog', 'sync_runs', 'authenticated', array[]::text[], 'authenticated: no access to sync_runs');
select table_privs_are('catalog', 'sync_vanished', 'authenticated', array[]::text[], 'authenticated: no access to sync_vanished');
select table_privs_are('catalog', 'live_searches', 'authenticated', array[]::text[], 'authenticated: no access to live_searches');
select table_privs_are('catalog', 'sync_runs', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'service_role: sync_runs without delete');
select table_privs_are('catalog', 'albums', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'service_role still cannot delete albums');

select function_privs_are('catalog', 'apply_album_redirect', array['uuid', 'uuid'], 'anon', array[]::text[], 'anon cannot apply redirects');
select function_privs_are('catalog', 'apply_album_redirect', array['uuid', 'uuid'], 'authenticated', array[]::text[], 'authenticated cannot apply redirects');
select function_privs_are('catalog', 'retire_album', array['bigint'], 'authenticated', array[]::text[], 'authenticated cannot retire albums');
select function_privs_are('catalog', 'apply_album_redirect', array['uuid', 'uuid'], 'service_role', array['EXECUTE'], 'service_role can apply redirects');

-- Fixtures ----------------------------------------------------------------------------------------
insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('dddddddd-0000-4000-8000-000000000001', 'Florbix Original', 'Florbix Quartet', 'Album'),  -- merged away
  ('dddddddd-0000-4000-8000-000000000002', 'Florbix Survivor', 'Florbix Quartet', 'Album'),  -- survivor
  ('dddddddd-0000-4000-8000-000000000003', 'Florbix Renamed', 'Florbix Quartet', 'Album'),   -- MBID changes
  ('dddddddd-0000-4000-8000-000000000005', 'Florbix Deleted', 'Florbix Quartet', 'Album');   -- retired
-- Merged into the first album earlier, so it must follow the chain to the survivor.
insert into catalog.albums (mbid, title, artist_credit, primary_type, retired, merged_into_id)
select 'dddddddd-0000-4000-8000-000000000004', 'Florbix Older Dupe', 'Florbix Quartet', 'Album', true, id
from catalog.albums where mbid = 'dddddddd-0000-4000-8000-000000000001';

create temp table ids on commit drop as
  select (select id from catalog.albums where mbid = 'dddddddd-0000-4000-8000-000000000001') as original,
         (select id from catalog.albums where mbid = 'dddddddd-0000-4000-8000-000000000002') as survivor,
         (select id from catalog.albums where mbid = 'dddddddd-0000-4000-8000-000000000003') as renamed,
         (select id from catalog.albums where mbid = 'dddddddd-0000-4000-8000-000000000004') as older_dupe,
         (select id from catalog.albums where mbid = 'dddddddd-0000-4000-8000-000000000005') as deleted;
grant select on ids to anon, authenticated, service_role;

insert into catalog.sync_runs (status) values ('running');
insert into catalog.sync_vanished (album_id, run_id)
select a, (select max(id) from catalog.sync_runs) from ids, unnest(array[original, renamed, deleted]) as a;

-- Clients cannot call them ------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok(
  $$select catalog.apply_album_redirect('dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002')$$,
  '42501', null, 'signed-in users cannot apply redirects'
);
select throws_ok($$select catalog.retire_album((select deleted from ids))$$, '42501', null, 'signed-in users cannot retire albums');
select throws_ok($$select * from catalog.sync_runs$$, '42501', null, 'signed-in users cannot read sync runs');

-- The sync worker (service role) ------------------------------------------------------------------
set local role service_role;

select is(
  catalog.apply_album_redirect('dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002'),
  'merged', 'a redirect to an album already in the catalog merges'
);
select ok(
  (select retired and merged_into_id = (select survivor from ids) from catalog.albums where id = (select original from ids)),
  'the merged album is retired and points at the survivor'
);
select is(
  (select merged_into_id from catalog.albums where id = (select older_dupe from ids)),
  (select survivor from ids), 'albums merged into it earlier now point straight at the survivor'
);
select is(
  (select new_mbid from catalog.mbid_redirects where old_mbid = 'dddddddd-0000-4000-8000-000000000001'),
  'dddddddd-0000-4000-8000-000000000002'::uuid, 'the redirect is recorded'
);
select ok(
  not exists (select 1 from catalog.sync_vanished where album_id = (select original from ids)),
  'the merged album leaves sync_vanished'
);
select ok(
  not exists (select 1 from public.search_albums('florbix original', 50) where id = (select original from ids)),
  'merged albums are hidden from search'
);
select is(
  (select merged_into_id from public.get_album((select original from ids))),
  (select survivor from ids), 'get_album returns merged_into_id so the page can redirect'
);

select is(
  catalog.apply_album_redirect('dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-0000000000f3'),
  'renamed', 'a redirect to an MBID not in the catalog renames'
);
select is(
  (select mbid from catalog.albums where id = (select renamed from ids)),
  'dddddddd-0000-4000-8000-0000000000f3'::uuid, 'the album keeps our ID and takes the new MBID'
);
select ok(
  (select not retired and merged_into_id is null from catalog.albums where id = (select renamed from ids)),
  'a renamed album stays active'
);

select is(
  catalog.apply_album_redirect('dddddddd-0000-4000-8000-0000000000a9', 'dddddddd-0000-4000-8000-000000000002'),
  'unknown', 'a redirect for an MBID we never had is recorded and reported as unknown'
);
select ok(
  exists (select 1 from catalog.mbid_redirects where old_mbid = 'dddddddd-0000-4000-8000-0000000000a9'),
  'the unknown redirect is still recorded'
);
select throws_ok(
  $$select catalog.apply_album_redirect('dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002')$$,
  '22023', 'invalid_redirect', 'a redirect to itself is refused'
);

select lives_ok($$select catalog.retire_album((select deleted from ids))$$, 'retire_album runs');
select ok(
  (select retired from catalog.albums where id = (select deleted from ids))
  and not exists (select 1 from catalog.sync_vanished where album_id = (select deleted from ids)),
  'retire_album retires the album and clears it from sync_vanished'
);

select throws_ok(
  $$update catalog.albums set merged_into_id = (select survivor from ids), retired = false where id = (select renamed from ids)$$,
  '23514', null, 'a merged album must be retired'
);
select throws_ok(
  $$delete from catalog.albums where id = (select deleted from ids)$$,
  '42501', null, 'retired albums still cannot be deleted'
);

-- Search reports the text match -------------------------------------------------------------------
select ok(
  (select bool_and(match > 0 and match <= 1) from public.search_albums('florbix survivor', 5)),
  'search_albums returns match (word similarity) between 0 and 1'
);
select is(
  (select match from public.search_albums('florbix survivor florbix quartet', 50) where id = (select survivor from ids)),
  1::real, 'a query that is exactly title + artist has match 1'
);

select * from finish();
rollback;
