-- get_diary(): every listen newest first, including same-day repeats, with the Shooting Star and
-- (on each album's most recent listen only) the review.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');
update public.profiles set visibility = 'private' where username = 'bob';

insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('eeeeeeee-0000-4000-8000-000000000041', 'Dovetail Static', 'Mossgrave', 'Album'),
  ('eeeeeeee-0000-4000-8000-000000000042', 'Elm Signal', 'Mossgrave', 'Album');

insert into public.user_albums (user_id, album_id, rating, shooting_star_recording_mbid, shooting_star_title)
select '00000000-0000-0000-0000-00000000000a'::uuid, a.id,
       case a.title when 'Dovetail Static' then 3.5 end,
       case a.title when 'Dovetail Static' then 'eeeeeeee-0000-4000-8000-0000000000d1'::uuid end,
       case a.title when 'Dovetail Static' then 'Hinge' end
from catalog.albums a
where a.mbid in ('eeeeeeee-0000-4000-8000-000000000041', 'eeeeeeee-0000-4000-8000-000000000042')
union all
select '00000000-0000-0000-0000-00000000000b'::uuid, a.id, 1, null, null
from catalog.albums a where a.mbid = 'eeeeeeee-0000-4000-8000-000000000041';

-- Alice: Dovetail on 11-01 and twice on 11-15 (created in order), Elm on 11-10. Bob: one listen.
insert into public.listens (user_album_id, user_id, listened_on, created_at)
select ua.id, ua.user_id, v.d, v.c
from public.user_albums ua
join catalog.albums a on a.id = ua.album_id
join (values ('Dovetail Static', date '2026-11-01', timestamptz '2026-11-01 10:00+00'),
             ('Dovetail Static', date '2026-11-15', timestamptz '2026-11-15 10:00+00'),
             ('Dovetail Static', date '2026-11-15', timestamptz '2026-11-15 12:00+00'),
             ('Elm Signal', date '2026-11-10', timestamptz '2026-11-10 10:00+00')) v(t, d, c) on v.t = a.title
where ua.user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.listens (user_album_id, user_id, listened_on)
select id, user_id, '2026-11-02' from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b';

-- Reviews: Alice reviewed Dovetail (not Elm); Bob's private review.
update public.user_albums ua set review = 'Dovetail thoughts'
from catalog.albums a where a.id = ua.album_id and a.title = 'Dovetail Static' and ua.user_id = '00000000-0000-0000-0000-00000000000a';
update public.user_albums set review = 'Bob secret' where user_id = '00000000-0000-0000-0000-00000000000b';

set local role anon;
select set_config('request.jwt.claims', '', true);
select results_eq(
  $$select title, listened_on, created_at from public.get_diary('alice')$$,
  $$values ('Dovetail Static'::text, date '2026-11-15', timestamptz '2026-11-15 12:00+00'),
           ('Dovetail Static'::text, date '2026-11-15', timestamptz '2026-11-15 10:00+00'),
           ('Elm Signal'::text, date '2026-11-10', timestamptz '2026-11-10 10:00+00'),
           ('Dovetail Static'::text, date '2026-11-01', timestamptz '2026-11-01 10:00+00')$$,
  'every listen, newest first, same-day repeats included and ordered by creation'
);
select is((select shooting_star_title from public.get_diary('alice') limit 1), 'Hinge', 'diary rows carry the Shooting Star');
select is((select rating from public.get_diary('alice') limit 1), 3.5, 'diary rows carry the album rating');
select is((select count(*)::int from public.get_diary('bob')), 0, 'anon cannot read a private user''s diary');
select results_eq(
  $$select title, listened_on, review from public.get_diary('alice')$$,
  $$values ('Dovetail Static'::text, date '2026-11-15', 'Dovetail thoughts'::text),
           ('Dovetail Static'::text, date '2026-11-15', null::text),
           ('Elm Signal'::text, date '2026-11-10', null::text),
           ('Dovetail Static'::text, date '2026-11-01', null::text)$$,
  'the review shows on the album''s most recent listen only; unreviewed albums have none'
);

-- Keyset pagination: the rows after the second one.
select results_eq(
  $$select title, listened_on from public.get_diary('alice', date '2026-11-15', timestamptz '2026-11-15 10:00+00',
      (select listen_id from public.get_diary('alice') offset 1 limit 1), 10)$$,
  $$values ('Elm Signal'::text, date '2026-11-10'), ('Dovetail Static'::text, date '2026-11-01')$$,
  'the cursor returns the rows after it'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from public.get_diary('bob')), 0, 'a user cannot read another user''s private diary');
select is((select count(*)::int from public.get_diary('bob') where review is not null), 0, 'a user cannot read another user''s private review');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from public.get_diary('bob')), 1, 'a private user reads their own diary');
select is((select review from public.get_diary('bob')), 'Bob secret', 'a private user reads their own review');
select is((select count(*)::int from public.get_diary('alice')), 4, 'and can read a public user''s diary');

select * from finish();
rollback;
