-- catalog.tracks, set_album_tracks(), get_album(), get_album_tracks(): album pages and their tracklists.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(30);

select has_table('catalog', 'tracks', 'catalog.tracks exists');
select col_is_pk('catalog', 'tracks', array['album_id', 'disc_number', 'position'], 'primary key is (album_id, disc_number, position)');
select ok((select relrowsecurity from pg_class where oid = 'catalog.tracks'::regclass), 'RLS is enabled on tracks');
select table_privs_are('catalog', 'tracks', 'anon', array['SELECT'], 'anon: tracks select only');
select table_privs_are('catalog', 'tracks', 'authenticated', array['SELECT'], 'authenticated: tracks select only');
select table_privs_are('catalog', 'tracks', 'service_role', array['SELECT', 'INSERT', 'DELETE'], 'service_role: tracks select, insert, delete');

insert into catalog.albums (mbid, title, artist_credit, primary_type, canonical_release_mbid, retired) values
  ('cccccccc-0000-4000-8000-000000000001', 'Qworble Sessions', 'The Qworbles', 'Album', 'cccccccc-0000-4000-8000-0000000000e1', false),
  ('cccccccc-0000-4000-8000-000000000002', 'Qworble Gone', 'The Qworbles', 'Album', null, true);

create temp table ids on commit drop as
  select (select id from catalog.albums where mbid = 'cccccccc-0000-4000-8000-000000000001') as album,
         (select id from catalog.albums where mbid = 'cccccccc-0000-4000-8000-000000000002') as retired_album;
grant select on ids to anon, authenticated, service_role;

-- Two discs, given out of order on purpose.
create temp table two_discs on commit drop as select $$[
  {"disc_number": 2, "position": 1, "recording_mbid": "cccccccc-0000-4000-8000-0000000000a3", "title": "Disc Two Opener", "length_ms": 200000},
  {"disc_number": 1, "position": 2, "recording_mbid": "cccccccc-0000-4000-8000-0000000000a2", "title": " Second ", "length_ms": null},
  {"disc_number": 1, "position": 1, "recording_mbid": "cccccccc-0000-4000-8000-0000000000a1", "title": "First", "length_ms": 185000}
]$$::jsonb as tracks;
grant select on two_discs to service_role;

-- Before tracks are loaded.
set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select title from public.get_album((select album from ids))), 'Qworble Sessions', 'anon can read an album');
select is((select tracks_current from public.get_album((select album from ids))), false, 'tracks_current is false before tracks are loaded');
select is((select count(*)::int from public.get_album(-1)), 0, 'an unknown album id returns no row');
select is((select retired from public.get_album((select retired_album from ids))), true, 'retired albums are still returned');
select throws_ok(
  $$select public.set_album_tracks((select album from ids), 'cccccccc-0000-4000-8000-0000000000e1', '[]'::jsonb)$$,
  '42501', null, 'anon cannot write tracks'
);
select throws_ok(
  $$insert into catalog.tracks (album_id, disc_number, position, recording_mbid, title) select album, 1, 1, gen_random_uuid(), 'x' from ids$$,
  '42501', null, 'anon cannot insert tracks directly'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok(
  $$select public.set_album_tracks((select album from ids), 'cccccccc-0000-4000-8000-0000000000e1', (select tracks from two_discs))$$,
  '42501', null, 'signed-in users cannot write tracks'
);

-- The web server (service role) loads them.
set local role service_role;
select is(
  public.set_album_tracks((select album from ids), 'cccccccc-0000-4000-8000-0000000000e1', (select tracks from two_discs)),
  3, 'set_album_tracks stores the tracks and returns how many'
);
select ok(
  (select tracks_loaded_at is not null and tracks_release_mbid = 'cccccccc-0000-4000-8000-0000000000e1'
   from catalog.albums where id = (select album from ids)),
  'set_album_tracks records when and from which release'
);
select is(
  public.set_album_tracks((select album from ids), 'cccccccc-0000-4000-8000-0000000000e1', (select tracks from two_discs)),
  3, 'loading again replaces the tracks instead of duplicating them'
);
select is((select count(*)::int from catalog.tracks where album_id = (select album from ids)), 3, 'still three tracks after a reload');

select throws_ok(
  $$select public.set_album_tracks((select album from ids), 'cccccccc-0000-4000-8000-0000000000e9', (select tracks from two_discs))$$,
  '22023', 'release_mismatch', 'tracks for a release other than the canonical one are refused'
);
select throws_ok(
  $$select public.set_album_tracks(-1, 'cccccccc-0000-4000-8000-0000000000e1', (select tracks from two_discs))$$,
  'P0002', 'album_not_found', 'an unknown album is refused'
);
select throws_ok(
  $$select public.set_album_tracks((select album from ids), 'cccccccc-0000-4000-8000-0000000000e1', '[]'::jsonb)$$,
  '22023', 'invalid_tracks', 'an empty tracklist is refused'
);
select throws_ok(
  $$select public.set_album_tracks((select album from ids), 'cccccccc-0000-4000-8000-0000000000e1',
      '[{"disc_number": 1, "position": 1, "recording_mbid": "cccccccc-0000-4000-8000-0000000000a1", "title": "  "}]'::jsonb)$$,
  '22023', 'invalid_tracks', 'a blank track title is refused'
);
select throws_ok(
  $$select public.set_album_tracks((select album from ids), 'cccccccc-0000-4000-8000-0000000000e1',
      '[{"disc_number": 1, "position": 1, "recording_mbid": "cccccccc-0000-4000-8000-0000000000a1", "title": "A"},
        {"disc_number": 1, "position": 1, "recording_mbid": "cccccccc-0000-4000-8000-0000000000a2", "title": "B"}]'::jsonb)$$,
  '22023', 'invalid_tracks', 'two tracks in the same position are refused'
);
select throws_ok(
  $$select public.set_album_tracks((select album from ids), 'cccccccc-0000-4000-8000-0000000000e1',
      '[{"disc_number": 1, "position": 1, "recording_mbid": "not-a-uuid", "title": "A"}]'::jsonb)$$,
  '22023', 'invalid_tracks', 'a malformed recording MBID is refused'
);
select is((select count(*)::int from catalog.tracks where album_id = (select album from ids)), 3, 'a refused load leaves the previous tracks in place');
select throws_ok(
  $$delete from catalog.albums where id = (select album from ids)$$,
  '42501', null, 'albums still cannot be deleted'
);

-- Reading them back, as anyone.
set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select tracks_current from public.get_album((select album from ids))), true, 'tracks_current is true once loaded');
select results_eq(
  $$select disc_number::int, position::int, title from public.get_album_tracks((select album from ids))$$,
  $$values (1, 1, 'First'), (1, 2, 'Second'), (2, 1, 'Disc Two Opener')$$,
  'tracks come back first disc first, first track at the top, titles trimmed'
);
select is(
  (select length_ms from public.get_album_tracks((select album from ids)) where title = 'First'),
  185000, 'track lengths are kept'
);
select is((select count(*)::int from public.get_album_tracks(-1)), 0, 'an unknown album has no tracks');

-- When the canonical release changes upstream, the stored tracks are no longer current.
reset role;
update catalog.albums set canonical_release_mbid = 'cccccccc-0000-4000-8000-0000000000e2' where id = (select album from ids);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select tracks_current from public.get_album((select album from ids))), false, 'a changed canonical release marks the tracks stale');

select * from finish();
rollback;
