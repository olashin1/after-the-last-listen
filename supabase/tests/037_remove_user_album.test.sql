-- remove_user_album(): remove an album from your albums with all its listens.
-- Fixtures use invented names and fake MBIDs so the tests pass on an empty or a full catalog.
begin;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');

insert into catalog.albums (mbid, title, artist_credit, primary_type) values
  ('abababab-0000-4000-8000-000000000001', 'Gilded Static', 'Morrow Vale', 'Album'),
  ('abababab-0000-4000-8000-000000000002', 'Paper Comets', 'Morrow Vale', 'Album');
create temp table ids on commit drop as
  select (select id from catalog.albums where mbid = 'abababab-0000-4000-8000-000000000001') as album1,
         (select id from catalog.albums where mbid = 'abababab-0000-4000-8000-000000000002') as album2;
grant select on ids to anon, authenticated;

-- Alice: album1 twice, album2 once. Bob: album1 once.
insert into public.user_albums (user_id, album_id, rating, review)
select '00000000-0000-0000-0000-00000000000a'::uuid, album1, 4, 'Alice on album1' from ids
union all select '00000000-0000-0000-0000-00000000000a'::uuid, album2, null, null from ids
union all select '00000000-0000-0000-0000-00000000000b'::uuid, album1, 2, 'Bob on album1' from ids;
insert into public.listens (user_album_id, user_id, listened_on)
select ua.id, ua.user_id, d
from public.user_albums ua
cross join (values (date '2026-11-01'), (date '2026-11-02')) v(d)
where ua.user_id = '00000000-0000-0000-0000-00000000000a' and ua.album_id = (select album1 from ids)
union all
select ua.id, ua.user_id, date '2026-11-03' from public.user_albums ua
where not (ua.user_id = '00000000-0000-0000-0000-00000000000a' and ua.album_id = (select album1 from ids));

select function_privs_are('public', 'remove_user_album', array['bigint'], 'anon', array[]::text[], 'anon cannot execute remove_user_album');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select is(public.remove_user_album((select album1 from ids)), 2, 'returns the number of listens removed');
select is((select count(*)::int from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000a' and album_id = (select album1 from ids)), 0, 'the collection record is gone');
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000a'), 1, 'its listens are gone; other albums'' listens stay');
select throws_ok($$select public.remove_user_album((select album1 from ids))$$, 'P0002', 'not_in_collection', 'removing it again is an error');

reset role;
select is((select review from public.user_albums where user_id = '00000000-0000-0000-0000-00000000000b'), 'Bob on album1', 'another user''s record for the same album is untouched');
select is((select count(*)::int from public.listens where user_id = '00000000-0000-0000-0000-00000000000b'), 1, 'another user''s listens are untouched');

-- Alice cannot remove Bob's album: the function only ever removes the caller's own record.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$select public.remove_user_album((select album1 from ids))$$, 'P0002', 'not_in_collection', 'a user without the album cannot remove anyone else''s');

set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.remove_user_album((select album2 from ids))$$, '42501', null, 'anon cannot remove albums');

select * from finish();
rollback;
