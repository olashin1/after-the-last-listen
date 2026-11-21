-- catalog.mbid_redirects: upstream merges (old MBID -> surviving MBID), and who can read/write.
begin;
select plan(13);

select col_is_pk('catalog', 'mbid_redirects', 'old_mbid', 'old_mbid is the primary key');
select has_index('catalog', 'mbid_redirects', 'mbid_redirects_new_mbid_idx', 'redirects are indexed by new_mbid');

set local role service_role;

select lives_ok(
  $$insert into catalog.mbid_redirects (old_mbid, new_mbid, entity) values
      ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'release_group'),
      ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2', 'artist'),
      ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b3', 'recording')$$,
  'service role can record release group, artist and recording redirects'
);
select ok(
  (select created_at is not null from catalog.mbid_redirects where old_mbid = '00000000-0000-0000-0000-0000000000a1'),
  'created_at is set'
);
select throws_ok(
  $$insert into catalog.mbid_redirects (old_mbid, new_mbid, entity) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'release_group')$$,
  '23505', null, 'an old MBID redirects to one place'
);
select throws_ok(
  $$insert into catalog.mbid_redirects (old_mbid, new_mbid, entity) values ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a9', 'artist')$$,
  '23514', null, 'an MBID cannot redirect to itself'
);
select throws_ok(
  $$insert into catalog.mbid_redirects (old_mbid, new_mbid, entity) values (gen_random_uuid(), gen_random_uuid(), 'label')$$,
  '23514', null, 'entity must be artist, release_group or recording'
);
select lives_ok(
  $$update catalog.mbid_redirects set new_mbid = '00000000-0000-0000-0000-0000000000c1' where old_mbid = '00000000-0000-0000-0000-0000000000a1'$$,
  'service role can repoint a redirect (chained merges)'
);
select throws_ok($$delete from catalog.mbid_redirects$$, '42501', null, 'service role cannot delete redirects');

-- Signed out.
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(
  (select new_mbid from catalog.mbid_redirects where old_mbid = '00000000-0000-0000-0000-0000000000a1'),
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'anon can read redirects'
);
select throws_ok(
  $$insert into catalog.mbid_redirects (old_mbid, new_mbid, entity) values (gen_random_uuid(), gen_random_uuid(), 'artist')$$,
  '42501', null, 'anon cannot add redirects'
);

-- Signed in.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok($$update catalog.mbid_redirects set new_mbid = gen_random_uuid()$$, '42501', null, 'signed-in users cannot change redirects');
select throws_ok($$delete from catalog.mbid_redirects$$, '42501', null, 'signed-in users cannot delete redirects');

select * from finish();
rollback;
