-- update_user_album(): edit rating, review and Shooting Star without adding a listen.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');
update public.profiles set visibility = 'private' where username = 'bob';

insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('eeeeeeee-0000-4000-8000-000000000011', 'Fennel Index', 'Mossgrave', 'Album'),
  ('eeeeeeee-0000-4000-8000-000000000012', 'Fennel Unlogged', 'Mossgrave', 'Album');

create temp table ids on commit drop as
  select (select id from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000011') as album,
         (select id from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000012') as unlogged;
grant select on ids to anon, authenticated;

insert into catalog.tracks (album_id, disc_number, position, recording_mbid, title)
select album, 1, 1, 'eeeeeeee-0000-4000-8000-0000000000b1'::uuid, 'Copper Wire' from ids
union all
select album, 1, 2, 'eeeeeeee-0000-4000-8000-0000000000b2'::uuid, 'Low Tide' from ids;

insert into public.user_albums (user_id, album_id, rating, review, updated_at)
select '00000000-0000-0000-0000-00000000000a'::uuid, album, 3, 'First take', '2000-01-01'::timestamptz from ids
union all
select '00000000-0000-0000-0000-00000000000b'::uuid, album, 2, 'Bob take', '2000-01-01' from ids;
insert into public.listens (user_album_id, user_id, listened_on)
select id, user_id, '2026-11-01' from public.user_albums;

select function_privs_are('public', 'update_user_album', array['bigint', 'numeric', 'text', 'uuid'], 'anon', array[]::text[], 'anon cannot execute update_user_album');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select throws_ok($$select public.update_user_album((select unlogged from ids), 3, null, null)$$,
  'P0002', 'not_in_collection', 'an album not in the collection is rejected');
select throws_ok($$select public.update_user_album((select album from ids), 0.3, null, null)$$,
  '22023', 'invalid_rating', 'an invalid rating is rejected');
select throws_ok($$select public.update_user_album((select album from ids), null, repeat('x', 5001), null)$$,
  '22023', 'review_too_long', 'a long review is rejected');
select throws_ok($$select public.update_user_album((select album from ids), null, null, 'eeeeeeee-0000-4000-8000-0000000000ff')$$,
  '22023', 'invalid_shooting_star', 'a Shooting Star not on the tracklist is rejected');

-- Adding the Shooting Star later.
select is(
  (select shooting_star_title from public.update_user_album((select album from ids), 4.5, ' Better now ', 'eeeeeeee-0000-4000-8000-0000000000b2')),
  'Low Tide', 'a Shooting Star can be added later; its title is copied'
);
select results_eq(
  $$select rating, review from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values (4.5::numeric, 'Better now'::text)$$,
  'rating and review are replaced'
);
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000a'), 1, 'editing adds no listen');
select isnt((select updated_at from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'), '2000-01-01'::timestamptz, 'an edit moves updated_at');

-- The current pick survives a tracklist that no longer has it (not loaded, or changed upstream).
reset role;
delete from catalog.tracks where album_id = (select album from ids);
-- Reset updated_at past the trigger, to see whether the next save touches the row.
alter table public.user_albums disable trigger user_albums_touch_updated_at;
update public.user_albums set updated_at = '2000-01-01' where user_id = '00000000-0000-0000-0000-00000000000a';
alter table public.user_albums enable trigger user_albums_touch_updated_at;
set local role authenticated;
select is(
  (select shooting_star_title from public.update_user_album((select album from ids), 4.5, 'Better now', 'eeeeeeee-0000-4000-8000-0000000000b2')),
  'Low Tide', 'the current Shooting Star is kept when the tracklist is gone'
);
select is((select updated_at from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'), '2000-01-01'::timestamptz, 'saving unchanged values leaves updated_at alone');
select throws_ok($$select public.update_user_album((select album from ids), null, null, 'eeeeeeee-0000-4000-8000-0000000000b1')$$,
  '22023', 'invalid_shooting_star', 'a different star needs the tracklist');
select is(
  (select shooting_star_title from public.log_album((select album from ids), (now() at time zone 'utc')::date, (now() at time zone 'utc')::date, 4.5, 'Better now', 'eeeeeeee-0000-4000-8000-0000000000b2') l
   join public.user_albums ua on ua.id = l.user_album_id),
  'Low Tide', 'a prefilled re-log keeps the current Shooting Star without a tracklist'
);

-- Clearing everything.
select results_eq(
  $$select rating, review, shooting_star_recording_mbid, shooting_star_title from public.update_user_album((select album from ids), null, '', null)$$,
  $$values (null::numeric, null::text, null::uuid, null::text)$$,
  'NULL and blank clear rating, review and Shooting Star'
);

-- Alice can't edit Bob's entry: the function only ever edits the caller's own record.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$select public.update_user_album((select album from ids), 1, 'hacked', null)$$,
  'P0002', 'not_in_collection', 'a user without an entry cannot edit anyone else''s');

reset role;
select results_eq(
  $$select rating, review from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  $$values (2.0::numeric, 'Bob take'::text)$$,
  'bob''s entry is unchanged'
);

set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.update_user_album((select album from ids), 1, null, null)$$,
  '42501', null, 'anon cannot edit');

select * from finish();
rollback;
