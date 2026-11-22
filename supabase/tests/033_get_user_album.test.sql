-- get_user_album(): the caller's own entry for an album, with listen stats.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(6);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');

insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('eeeeeeee-0000-4000-8000-000000000021', 'Quill Harbour', 'Mossgrave', 'Album');
create temp table ids on commit drop as
  select (select id from catalog.albums where mbid = 'eeeeeeee-0000-4000-8000-000000000021') as album;
grant select on ids to anon, authenticated;

insert into public.user_albums (user_id, album_id, rating, review)
select '00000000-0000-0000-0000-00000000000b', album, 2, 'Bob review' from ids;
insert into public.listens (user_album_id, user_id, listened_on)
select ua.id, ua.user_id, v.d
from public.user_albums ua, (values (date '2026-10-01'), (date '2026-11-05'), (date '2026-11-05')) v(d);

set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.get_user_album((select album from ids))), 0, 'signed out: no entry');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select results_eq(
  $$select rating, review, listen_count, first_listened_on, last_listened_on from public.get_user_album((select album from ids))$$,
  $$values (2.0::numeric, 'Bob review'::text, 3, date '2026-10-01', date '2026-11-05')$$,
  'the owner gets their entry with listen count, first and last listen'
);
select is((select count(*)::int from public.get_user_album(-1)), 0, 'an unknown album: no entry');

-- Alice gets only her own entry (none), never Bob's, even while Bob's profile is public.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from public.get_user_album((select album from ids))), 0, 'another user does not get the owner''s entry');

-- Bob private: still only his.
reset role;
update public.profiles set visibility = 'private' where username = 'bob';
set local role authenticated;
select is((select count(*)::int from public.get_user_album((select album from ids))), 0, 'another user does not get a private owner''s entry');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from public.get_user_album((select album from ids))), 1, 'a private owner gets their own entry');

select * from finish();
rollback;
