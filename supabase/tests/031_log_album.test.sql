-- log_album(): one call saves the collection record and a dated listen (PRD §5, §9).
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(34);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');
update public.profiles set visibility = 'private' where username = 'bob';

insert into catalog.albums (mbid, title, artist_credit, primary_type, canonical_release_mbid) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'Plinth Weather', 'Mossgrave', 'Album', 'eeeeeeee-0000-4000-8000-0000000000e1'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'Plinth Untracked', 'Mossgrave', 'Album', null);
insert into catalog.albums (mbid, title, artist_credit, primary_type, retired, merged_into_id)
select 'eeeeeeee-0000-4000-8000-000000000003', 'Plinth Weather (dupe)', 'Mossgrave', 'Album', true, id
from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000001';

create temp table ids on commit drop as
  select (select id from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000001') as tracked,
         (select id from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000002') as untracked,
         (select id from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000003') as merged,
         (now() at time zone 'utc')::date as today;
grant select on ids to anon, authenticated;

insert into catalog.tracks (album_id, disc_number, position, recording_mbid, title, length_ms)
select tracked, 1, 1, 'eeeeeeee-0000-4000-8000-0000000000a1'::uuid, 'Lantern Song', 200000 from ids
union all
select tracked, 1, 2, 'eeeeeeee-0000-4000-8000-0000000000a2'::uuid, 'Slow Gravel', 180000 from ids;

select function_privs_are('public', 'log_album', array['bigint', 'date', 'date', 'numeric', 'text', 'uuid', 'uuid'], 'anon', array[]::text[], 'anon cannot execute log_album');
select function_privs_are('public', 'log_album', array['bigint', 'date', 'date', 'numeric', 'text', 'uuid', 'uuid'], 'authenticated', array['EXECUTE'], 'authenticated can execute log_album');

-- Signed out.
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$select * from public.log_album((select tracked from ids), (select today from ids), (select today from ids))$$,
  '42501', null, 'anon cannot log'
);

-- Signed in as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

-- Validation.
select throws_ok($$select * from public.log_album(-1, (select today from ids), (select today from ids))$$,
  'P0002', 'album_not_found', 'an unknown album is rejected');
select throws_ok($$select * from public.log_album((select merged from ids), (select today from ids), (select today from ids))$$,
  '22023', 'album_merged', 'a merged album is rejected');
select throws_ok($$select * from public.log_album((select tracked from ids), (select today + 1 from ids), (select today from ids))$$,
  '22023', 'future_date', 'a listen after the caller''s today is rejected');
select throws_ok($$select * from public.log_album((select tracked from ids), (select today from ids), (select today + 5 from ids))$$,
  '22023', 'invalid_date', 'a client "today" far from the server date is rejected');
select throws_ok($$select * from public.log_album((select tracked from ids), date '1899-12-31', (select today from ids))$$,
  '22023', 'invalid_date', 'a listen before 1900 is rejected');
select throws_ok($$select * from public.log_album((select tracked from ids), null, (select today from ids))$$,
  '22023', 'invalid_date', 'a missing date is rejected');
select throws_ok($$select * from public.log_album((select tracked from ids), (select today from ids), (select today from ids), 0)$$,
  '22023', 'invalid_rating', 'a rating of zero is rejected');
select throws_ok($$select * from public.log_album((select tracked from ids), (select today from ids), (select today from ids), 4.25)$$,
  '22023', 'invalid_rating', 'a rating off the half steps is rejected');
select throws_ok($$select * from public.log_album((select tracked from ids), (select today from ids), (select today from ids), 5.5)$$,
  '22023', 'invalid_rating', 'a rating over 5 is rejected');
select throws_ok($$select * from public.log_album((select tracked from ids), (select today from ids), (select today from ids), null, repeat('x', 5001))$$,
  '22023', 'review_too_long', 'a review over 5,000 characters is rejected');
select throws_ok($$select * from public.log_album((select tracked from ids), (select today from ids), (select today from ids), null, null, 'eeeeeeee-0000-4000-8000-0000000000ff')$$,
  '22023', 'invalid_shooting_star', 'a Shooting Star not on the tracklist is rejected');
select throws_ok($$select * from public.log_album((select untracked from ids), (select today from ids), (select today from ids), null, null, 'eeeeeeee-0000-4000-8000-0000000000a1')$$,
  '22023', 'invalid_shooting_star', 'a Shooting Star from another album is rejected');
select is((select count(*)::int from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'failed logs save nothing');

-- First log: collection record and listen together.
select lives_ok(
  $$select * from public.log_album((select tracked from ids), (select today - 3 from ids), (select today from ids), 3.5, '  Great record.  ', 'eeeeeeee-0000-4000-8000-0000000000a2', 'eeeeeeee-0000-4000-8000-0000000000f1')$$,
  'a first log with rating, review and Shooting Star succeeds'
);
select results_eq(
  $$select rating, review, shooting_star_recording_mbid, shooting_star_title from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values (3.5::numeric, 'Great record.'::text, 'eeeeeeee-0000-4000-8000-0000000000a2'::uuid, 'Slow Gravel'::text)$$,
  'the collection record stores the values, trimmed review and copied star title'
);
select results_eq(
  $$select listened_on from public.listens where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$select today - 3 from ids$$,
  'the same call adds a backdated listen'
);

-- Double tap: the same request id returns the same listen and changes nothing.
select results_eq(
  $$select listen_id from public.log_album((select tracked from ids), (select today from ids), (select today from ids), 1, 'changed', null, 'eeeeeeee-0000-4000-8000-0000000000f1')$$,
  $$select id from public.listens where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'a repeated request id returns the existing listen'
);
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000a'), 1, 'a repeated request id adds no listen');
select is((select rating from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'), 3.5, 'a repeated request id changes no values');

-- Re-log (prefilled form): values replaced, a new listen, still one collection record.
select lives_ok(
  $$select * from public.log_album((select tracked from ids), (select today from ids), (select today from ids), 4, '', 'eeeeeeee-0000-4000-8000-0000000000a2', 'eeeeeeee-0000-4000-8000-0000000000f2')$$,
  're-logging an album succeeds'
);
-- Same-day repeat, no request id.
select lives_ok(
  $$select * from public.log_album((select tracked from ids), (select today from ids), (select today from ids), 4, null, 'eeeeeeee-0000-4000-8000-0000000000a2')$$,
  'a same-day repeat succeeds'
);
select is((select count(*)::int from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'), 1, 're-logging keeps one collection record');
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000a'), 3, 're-logging and same-day repeats each add a listen');
select results_eq(
  $$select rating, review from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values (4.0::numeric, null::text)$$,
  're-logging replaces the values (a blank review clears it)'
);

-- Unrated, no review, no star; an album without a loaded tracklist.
select lives_ok(
  $$select * from public.log_album((select untracked from ids), (select today from ids), (select today from ids))$$,
  'logging works without a rating, review, Shooting Star or tracklist'
);
select is(
  (select rating from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a' and album_id = (select untracked from ids)),
  null, 'an unrated log stores NULL'
);

-- Signed in as Bob: his own private entry, separate from Alice's.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok(
  $$select * from public.log_album((select tracked from ids), (select today from ids), (select today from ids), 2, 'Bob review', null, 'eeeeeeee-0000-4000-8000-0000000000f1')$$,
  'another user can reuse a request id value and log the same album'
);
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000b'), 1, 'bob''s log added his own listen');

-- Alice cannot touch Bob's entry: logging always writes the caller's own record.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(
  (select user_album_id from public.log_album((select tracked from ids), (select today from ids), (select today from ids), 1, 'not bob', 'eeeeeeee-0000-4000-8000-0000000000a2')),
  (select id from public.user_albums where album_id = (select tracked from ids)),
  'logging an album bob logged writes alice''s own record (the only one she can see)'
);

reset role;
select results_eq(
  $$select rating, review from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  $$values (2.0::numeric, 'Bob review'::text)$$,
  'bob''s entry is unchanged by alice''s logs'
);
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000b'), 1, 'bob has no extra listens');
-- The star kept when the album's tracklist no longer has it (prefilled re-log): see update_user_album tests.

select * from finish();
rollback;
