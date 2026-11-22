-- listen_list, add_to_listen_list(), remove_from_listen_list(), get_listen_list(), and log_album()
-- taking logged albums off the list.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(20);

select has_table('public', 'listen_list', 'listen_list exists');
select ok((select relrowsecurity from pg_class where oid = 'public.listen_list'::regclass), 'RLS is enabled on listen_list');
select table_privs_are('public', 'listen_list', 'authenticated', array['SELECT'], 'authenticated: listen_list select only');
select function_privs_are('public', 'add_to_listen_list', array['bigint'], 'anon', array[]::text[], 'anon cannot add to a Listen List');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');
update public.profiles set visibility = 'private' where username = 'bob';

insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('cdcdcdcd-0000-4000-8000-000000000001', 'Harbor Lights', 'Quillon', 'Album'),
  ('cdcdcdcd-0000-4000-8000-000000000002', 'Salt Psalms', 'Quillon', 'Album'),
  ('cdcdcdcd-0000-4000-8000-000000000003', 'Tin Orchard', 'Quillon', 'EP');
insert into catalog.albums (mbid, title, artist_credit, primary_type, retired, merged_into_id)
select 'cdcdcdcd-0000-4000-8000-000000000004', 'Harbor Lights (dupe)', 'Quillon', 'Album', true, id
from catalog.albums where mbid = 'cdcdcdcd-0000-4000-8000-000000000001';
create temp table ids on commit drop as
  select (select id from catalog.albums where mbid = 'cdcdcdcd-0000-4000-8000-000000000001') as a1,
         (select id from catalog.albums where mbid = 'cdcdcdcd-0000-4000-8000-000000000002') as a2,
         (select id from catalog.albums where mbid = 'cdcdcdcd-0000-4000-8000-000000000003') as a3,
         (select id from catalog.albums where mbid = 'cdcdcdcd-0000-4000-8000-000000000004') as merged,
         (now() at time zone 'utc')::date as today;
grant select on ids to anon, authenticated;

-- Alice adds three albums (a1 first). Order by added_at needs distinct times, so set them after.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$select public.add_to_listen_list((select a1 from ids))$$, 'a user can add an album');
select lives_ok($$select public.add_to_listen_list((select a1 from ids))$$, 'adding the same album again is fine');
select lives_ok($$select public.add_to_listen_list((select a2 from ids))$$, 'a second album');
select lives_ok($$select public.add_to_listen_list((select a3 from ids))$$, 'a third album');
select is((select count(*)::int from public.listen_list where user_id = '00000000-0000-0000-0000-00000000000a'), 3, 'each album is on the list once');
select throws_ok($$select public.add_to_listen_list(-1)$$, 'P0002', 'album_not_found', 'an unknown album is rejected');
select throws_ok($$select public.add_to_listen_list((select merged from ids))$$, '22023', 'album_merged', 'a merged album is rejected');
select throws_ok($$insert into public.listen_list (user_id, album_id) values ('00000000-0000-0000-0000-00000000000b', (select a1 from ids))$$,
  '42501', null, 'clients cannot write the table directly (no writing to another user''s list)');

reset role;
update public.listen_list set added_at = '2026-11-01'::timestamptz + (album_id - (select a1 from ids)) * interval '1 day'
where user_id = '00000000-0000-0000-0000-00000000000a';
-- Bob (private) has one album on his list.
insert into public.listen_list (user_id, album_id) select '00000000-0000-0000-0000-00000000000b', a1 from ids;

set local role anon;
select set_config('request.jwt.claims', '', true);
select results_eq(
  $$select title from public.get_listen_list('alice')$$,
  $$values ('Tin Orchard'::text), ('Salt Psalms'::text), ('Harbor Lights'::text)$$,
  'a public user''s Listen List, most recently added first'
);
select results_eq(
  $$select title from public.get_listen_list('alice',
      (select added_at from public.get_listen_list('alice') offset 1 limit 1),
      (select listen_list_id from public.get_listen_list('alice') offset 1 limit 1))$$,
  $$values ('Harbor Lights'::text)$$,
  'the cursor returns the next page'
);
select is((select count(*)::int from public.get_listen_list('bob')), 0, 'anon cannot read a private user''s Listen List');

-- Signed in as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from public.listen_list where user_id = '00000000-0000-0000-0000-00000000000b'), 0, 'a user cannot read another user''s private Listen List');

select lives_ok($$select public.remove_from_listen_list((select a2 from ids))$$, 'a user can remove an album');
select lives_ok($$select public.remove_from_listen_list((select a2 from ids))$$, 'removing one that isn''t there is fine');

-- Logging an album takes it off the Listen List.
select lives_ok($$select * from public.log_album((select a1 from ids), (select today from ids), (select today from ids))$$, 'logging an album on the list works');
select results_eq(
  $$select title from public.get_listen_list('alice')$$,
  $$values ('Tin Orchard'::text)$$,
  'logging an album removes it from the Listen List; removed albums are gone'
);

select * from finish();
rollback;
