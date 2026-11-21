-- catalog.album_artists: multi-artist credits, keys, ordering, and who can read/write.
begin;
select plan(15);

select col_is_pk('catalog', 'album_artists', array['album_id', 'artist_id'], 'primary key is (album_id, artist_id)');
select has_index('catalog', 'album_artists', 'album_artists_artist_id_idx', 'credits are indexed by artist');

set local role service_role;

insert into catalog.artists (mbid, name, sort_name) values
  ('00000000-0000-0000-0000-0000000000e1', 'JAY-Z', 'JAY-Z'),
  ('00000000-0000-0000-0000-0000000000e2', 'Kanye West', 'West, Kanye'),
  ('00000000-0000-0000-0000-0000000000e3', 'Frank Ocean', 'Ocean, Frank');
insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('00000000-0000-0000-0000-0000000000f1', 'Watch the Throne', 'JAY-Z & Kanye West', 'Album');

create temp table ids on commit drop as
  select
    (select id from catalog.albums where mbid = '00000000-0000-0000-0000-0000000000f1') as album,
    (select id from catalog.artists where mbid = '00000000-0000-0000-0000-0000000000e1') as jay,
    (select id from catalog.artists where mbid = '00000000-0000-0000-0000-0000000000e2') as kanye,
    (select id from catalog.artists where mbid = '00000000-0000-0000-0000-0000000000e3') as frank;
grant select on ids to anon, authenticated;

select lives_ok(
  $$insert into catalog.album_artists (album_id, artist_id, position)
    select album, jay, 0 from ids union all select album, kanye, 1 from ids$$,
  'service role can add a two-artist credit'
);
select results_eq(
  $$select ar.name from catalog.album_artists aa join catalog.artists ar on ar.id = aa.artist_id
    where aa.album_id = (select album from ids) order by aa.position$$,
  $$values ('JAY-Z'::text), ('Kanye West'::text)$$,
  'credits come back in credit order'
);
select throws_ok(
  $$insert into catalog.album_artists (album_id, artist_id, position) select album, jay, 2 from ids$$,
  '23505', null, 'an artist appears once per album'
);
select throws_ok(
  $$insert into catalog.album_artists (album_id, artist_id, position) select album, frank, 1 from ids$$,
  '23505', null, 'two artists cannot share a position'
);
select throws_ok(
  $$insert into catalog.album_artists (album_id, artist_id, position) select album, frank, -1 from ids$$,
  '23514', null, 'position cannot be negative'
);
select throws_ok(
  $$insert into catalog.album_artists (album_id, artist_id, position) select -1, frank, 2 from ids$$,
  '23503', null, 'album must exist'
);
select throws_ok(
  $$insert into catalog.album_artists (album_id, artist_id, position) select album, -1, 2 from ids$$,
  '23503', null, 'artist must exist'
);
select lives_ok(
  $$delete from catalog.album_artists where album_id = (select album from ids) and artist_id = (select kanye from ids)$$,
  'service role can rewrite credits (delete a credit row)'
);
insert into catalog.album_artists (album_id, artist_id, position) select album, kanye, 1 from ids;

-- Signed out.
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from catalog.album_artists where album_id = (select album from ids)),
  2,
  'anon can read credits'
);
select throws_ok(
  $$insert into catalog.album_artists (album_id, artist_id, position) select album, frank, 2 from ids$$,
  '42501', null, 'anon cannot add credits'
);

-- Signed in.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok($$update catalog.album_artists set position = 5$$, '42501', null, 'signed-in users cannot reorder credits');
select throws_ok($$delete from catalog.album_artists$$, '42501', null, 'signed-in users cannot delete credits');

reset role;
select is(
  (select count(*)::int from catalog.album_artists where album_id = (select album from ids)),
  2,
  'credits are unchanged by readers'
);

select * from finish();
rollback;
