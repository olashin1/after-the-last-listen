-- user_albums and listens: constraints, RLS by profile visibility, and no direct client writes.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(40);

-- Schema and privileges.
select has_table('public', 'user_albums', 'user_albums exists');
select has_table('public', 'listens', 'listens exists');
select ok((select relrowsecurity from pg_class where oid = 'public.user_albums'::regclass), 'RLS is enabled on user_albums');
select ok((select relrowsecurity from pg_class where oid = 'public.listens'::regclass), 'RLS is enabled on listens');
select table_privs_are('public', 'user_albums', 'anon', array['SELECT'], 'anon: user_albums select only');
select table_privs_are('public', 'user_albums', 'authenticated', array['SELECT'], 'authenticated: user_albums select only');
select table_privs_are('public', 'user_albums', 'service_role', array['SELECT'], 'service_role: user_albums select only');
select table_privs_are('public', 'listens', 'anon', array['SELECT'], 'anon: listens select only');
select table_privs_are('public', 'listens', 'authenticated', array['SELECT'], 'authenticated: listens select only');
select table_privs_are('public', 'listens', 'service_role', array['SELECT'], 'service_role: listens select only');
select has_index('public', 'listens', 'listens_diary_idx', 'listens has the diary index');

-- Fixtures: Alice is public, Bob is private.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');
update public.profiles set visibility = 'private' where username = 'bob';

insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('dddddddd-0000-4000-8000-000000000001', 'Zorvane Hours', 'The Zorvanes', 'Album'),
  ('dddddddd-0000-4000-8000-000000000002', 'Zorvane Nights', 'The Zorvanes', 'EP');

create temp table ids on commit drop as
  select (select id from catalog.albums where mbid = 'dddddddd-0000-4000-8000-000000000001') as album1,
         (select id from catalog.albums where mbid = 'dddddddd-0000-4000-8000-000000000002') as album2;
grant select on ids to anon, authenticated;

insert into public.user_albums (user_id, album_id, rating, review, shooting_star_recording_mbid, shooting_star_title)
values
  ('00000000-0000-0000-0000-00000000000a', (select album1 from ids), 4.5, 'Alice review', 'dddddddd-0000-4000-8000-0000000000a1', 'Opener'),
  ('00000000-0000-0000-0000-00000000000b', (select album1 from ids), 3, 'Bob review', null, null);

insert into public.listens (user_album_id, user_id, listened_on, request_id)
select id, user_id, '2026-11-01', null from public.user_albums;
-- Same-day repeats are allowed.
insert into public.listens (user_album_id, user_id, listened_on)
select id, user_id, '2026-11-01' from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a';

-- Constraints (as the table owner).
select throws_ok(
  $$insert into public.user_albums (user_id, album_id, rating) values ('00000000-0000-0000-0000-00000000000a', (select album2 from ids), 0)$$,
  '23514', null, 'a rating of zero is rejected'
);
select throws_ok(
  $$insert into public.user_albums (user_id, album_id, rating) values ('00000000-0000-0000-0000-00000000000a', (select album2 from ids), 5.5)$$,
  '23514', null, 'a rating over 5 is rejected'
);
select throws_ok(
  $$insert into public.user_albums (user_id, album_id, rating) values ('00000000-0000-0000-0000-00000000000a', (select album2 from ids), 3.3)$$,
  '23514', null, 'a rating off the half-step scale is rejected'
);
select throws_ok(
  $$insert into public.user_albums (user_id, album_id, review) values ('00000000-0000-0000-0000-00000000000a', (select album2 from ids), '   ')$$,
  '23514', null, 'a blank review is rejected'
);
select throws_ok(
  $$insert into public.user_albums (user_id, album_id, review) values ('00000000-0000-0000-0000-00000000000a', (select album2 from ids), repeat('x', 5001))$$,
  '23514', null, 'a review over 5,000 characters is rejected'
);
select throws_ok(
  $$insert into public.user_albums (user_id, album_id, shooting_star_recording_mbid) values ('00000000-0000-0000-0000-00000000000a', (select album2 from ids), 'dddddddd-0000-4000-8000-0000000000a2')$$,
  '23514', null, 'a Shooting Star needs both the recording and its title'
);
select throws_ok(
  $$insert into public.user_albums (user_id, album_id) values ('00000000-0000-0000-0000-00000000000a', (select album1 from ids))$$,
  '23505', null, 'one collection record per user and album'
);
select throws_ok(
  $$insert into public.user_albums (user_id, album_id) values ('00000000-0000-0000-0000-00000000000a', -1)$$,
  '23503', null, 'the album must exist in the catalog'
);
select throws_ok(
  $$insert into public.listens (user_album_id, user_id, listened_on)
    select id, '00000000-0000-0000-0000-00000000000a', '2026-11-02' from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  '23503', null, 'a listen''s user must match its collection record'
);
select throws_ok(
  $$insert into public.listens (user_album_id, user_id, listened_on, note)
    select id, user_id, '2026-11-02', repeat('x', 501) from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514', null, 'a note over 500 characters is rejected'
);

insert into public.listens (user_album_id, user_id, listened_on, request_id)
select id, user_id, '2026-11-03', 'dddddddd-0000-4000-8000-0000000000f1' from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a';
select throws_ok(
  $$insert into public.listens (user_album_id, user_id, listened_on, request_id)
    select id, user_id, '2026-11-03', 'dddddddd-0000-4000-8000-0000000000f1' from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '23505', null, 'a request id is used once per user'
);

update public.user_albums set updated_at = '2000-01-01' where user_id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select updated_at from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'),
  now(), 'updates set updated_at'
);

-- Signed out: Alice's public content is visible, Bob's private content isn't.
set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.user_albums where album_id = (select album1 from ids)), 1, 'anon sees only the public user''s collection');
select is((select review from public.user_albums where album_id = (select album1 from ids)), 'Alice review', 'anon sees the public review');
select is((select count(*)::int from public.listens where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')), 3, 'anon sees only the public user''s listens');
select throws_ok(
  $$insert into public.user_albums (user_id, album_id) values ('00000000-0000-0000-0000-00000000000a', (select album2 from ids))$$,
  '42501', null, 'anon cannot write user_albums'
);

-- Signed in as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b'), 0, 'a user cannot read another user''s private collection');
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000b'), 0, 'a user cannot read another user''s private listens');
select throws_ok(
  $$insert into public.user_albums (user_id, album_id) values ('00000000-0000-0000-0000-00000000000a', (select album2 from ids))$$,
  '42501', null, 'a user cannot insert even their own collection record directly'
);
select throws_ok(
  $$update public.user_albums set rating = 1 where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  '42501', null, 'a user cannot update another user''s collection record'
);
select throws_ok(
  $$delete from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  '42501', null, 'a user cannot delete another user''s collection record'
);
select throws_ok(
  $$insert into public.listens (user_album_id, user_id, listened_on)
    values (1, '00000000-0000-0000-0000-00000000000a', '2026-11-04')$$,
  '42501', null, 'a user cannot insert listens directly'
);
select throws_ok(
  $$delete from public.listens where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  '42501', null, 'a user cannot delete another user''s listens'
);

-- Signed in as Bob: his own private content is visible to him.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select review from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b'), 'Bob review', 'a private user can read their own collection');
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000b'), 1, 'a private user can read their own listens');

reset role;
select is((select rating from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b'), 3.0, 'bob''s collection record is unchanged');

-- Cascades: removing a collection record removes its listens; deleting a user removes everything.
delete from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b';
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000b'), 0, 'deleting a collection record deletes its listens');
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'deleting a user deletes their collection');
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'deleting a user deletes their listens');

select * from finish();
rollback;
