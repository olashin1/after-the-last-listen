-- get_collection(): a user's albums (My Albums), one row per album, most recently listened first.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');
update public.profiles set visibility = 'private' where username = 'bob';

insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('eeeeeeee-0000-4000-8000-000000000031', 'Ashen Mile', 'Mossgrave', 'Album'),
  ('eeeeeeee-0000-4000-8000-000000000032', 'Brine Choir', 'Mossgrave', 'Album'),
  ('eeeeeeee-0000-4000-8000-000000000033', 'Cinder Loft', 'Mossgrave', 'EP');

insert into public.user_albums (user_id, album_id, rating, shooting_star_recording_mbid, shooting_star_title)
select '00000000-0000-0000-0000-00000000000a'::uuid, a.id,
       case a.title when 'Ashen Mile' then 4.5 end,
       case a.title when 'Ashen Mile' then 'eeeeeeee-0000-4000-8000-0000000000c1'::uuid end,
       case a.title when 'Ashen Mile' then 'Ember Road' end
from catalog.albums a
where a.mbid in ('eeeeeeee-0000-4000-8000-000000000031', 'eeeeeeee-0000-4000-8000-000000000032', 'eeeeeeee-0000-4000-8000-000000000033')
union all
select '00000000-0000-0000-0000-00000000000b'::uuid, a.id, 1, null, null
from catalog.albums a where a.mbid = 'eeeeeeee-0000-4000-8000-000000000031';

-- Alice: Ashen Mile twice (latest 11-10), Brine Choir 11-20, Cinder Loft 11-01. Bob: one listen.
insert into public.listens (user_album_id, user_id, listened_on)
select ua.id, ua.user_id, v.d
from public.user_albums ua
join catalog.albums a on a.id = ua.album_id
join (values ('Ashen Mile', date '2026-10-01'), ('Ashen Mile', date '2026-11-10'),
             ('Brine Choir', date '2026-11-20'), ('Cinder Loft', date '2026-11-01')) v(t, d) on v.t = a.title
where ua.user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.listens (user_album_id, user_id, listened_on)
select id, user_id, '2026-11-02' from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b';

set local role anon;
select set_config('request.jwt.claims', '', true);
select results_eq(
  $$select title from public.get_collection('alice')$$,
  $$values ('Brine Choir'::text), ('Ashen Mile'::text), ('Cinder Loft'::text)$$,
  'a public user''s albums, most recently listened first, once each'
);
select results_eq(
  $$select rating, shooting_star_title, listen_count, last_listened_on from public.get_collection('ALICE') where title = 'Ashen Mile'$$,
  $$values (4.5::numeric, 'Ember Road'::text, 2, date '2026-11-10')$$,
  'rows carry rating, Shooting Star, listen count and last listen; username is case-insensitive'
);
select is((select count(*)::int from public.get_collection('bob')), 0, 'anon cannot read a private user''s albums');
select is((select count(*)::int from public.get_collection('nobody_here')), 0, 'an unknown username returns nothing');

-- Keyset pagination.
select results_eq(
  $$select title from public.get_collection('alice', null, null, 2)$$,
  $$values ('Brine Choir'::text), ('Ashen Mile'::text)$$,
  'lim limits the page'
);
select results_eq(
  $$select title from public.get_collection('alice', date '2026-11-10',
      (select user_album_id from public.get_collection('alice') where title = 'Ashen Mile'), 2)$$,
  $$values ('Cinder Loft'::text)$$,
  'the cursor returns the next page'
);
select is((select count(*)::int from public.get_collection('alice', null, null, 0)), 1, 'lim is clamped to at least 1');

-- Signed in as Alice: Bob's private albums stay hidden.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from public.get_collection('bob')), 0, 'a user cannot read another user''s private albums');

-- Signed in as Bob.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from public.get_collection('bob')), 1, 'a private user reads their own albums');
select is((select count(*)::int from public.get_collection('alice')), 3, 'and can read a public user''s albums');

select * from finish();
rollback;
