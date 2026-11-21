-- catalog.artists: constraints, updated_at, retire-not-delete, and who can read/write.
begin;
select plan(16);

set local role service_role;

select lives_ok(
  $$insert into catalog.artists (mbid, name, sort_name, disambiguation) values
      ('aaaaaaaa-0000-4000-8000-000000000003', 'Qwyxel Floyd', 'Qwyxel Floyd', null),
      ('aaaaaaaa-0000-4000-8000-000000000004', 'The Qwyxel Beatles', 'Qwyxel Beatles, The', 'UK rock band')$$,
  'service role can insert artists'
);
select ok(
  (select retired = false and updated_at is not null from catalog.artists where name = 'Qwyxel Floyd'),
  'retired defaults to false and updated_at is set'
);
select throws_ok(
  $$insert into catalog.artists (mbid, name, sort_name) values ('aaaaaaaa-0000-4000-8000-000000000003', 'Dupe', 'Dupe')$$,
  '23505', null, 'artist MBIDs are unique'
);
select throws_ok(
  $$insert into catalog.artists (mbid, name, sort_name) values (gen_random_uuid(), '   ', 'x')$$,
  '23514', null, 'artist name cannot be blank'
);
select throws_ok(
  $$insert into catalog.artists (mbid, name, sort_name) values (gen_random_uuid(), 'No Sort Name', null)$$,
  '23502', null, 'sort_name is required'
);
select throws_ok(
  $$insert into catalog.artists (id, mbid, name, sort_name) values (999999, gen_random_uuid(), 'X', 'X')$$,
  '428C9', null, 'ids are generated, not supplied'
);

-- updated_at is bumped on update (now() is fixed within the test transaction, so set an old value first).
select lives_ok(
  $$update catalog.artists set updated_at = '2000-01-01', retired = true where name = 'Qwyxel Floyd'$$,
  'service role can retire an artist'
);
select is(
  (select updated_at from catalog.artists where name = 'Qwyxel Floyd'),
  now(),
  'updates set updated_at to now(), whatever value was given'
);

-- Never deleted.
select throws_ok($$delete from catalog.artists where name = 'Qwyxel Floyd'$$, '42501', null, 'service role cannot delete artists');
reset role;
select throws_ok(
  $$delete from catalog.artists where name = 'Qwyxel Floyd'$$,
  '42501', 'catalog artists rows are never deleted; set retired = true instead',
  'even the owner cannot delete artists'
);
select throws_ok($$truncate catalog.artists cascade$$, '42501', null, 'even the owner cannot truncate artists');

-- Signed out.
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from catalog.artists where mbid in ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000004')),
  2,
  'anon can read artists, including retired ones'
);
select throws_ok($$insert into catalog.artists (mbid, name, sort_name) values (gen_random_uuid(), 'X', 'X')$$, '42501', null, 'anon cannot insert artists');

-- Signed in.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok($$update catalog.artists set name = 'hacked-qwyxel'$$, '42501', null, 'signed-in users cannot update artists');
select throws_ok($$delete from catalog.artists$$, '42501', null, 'signed-in users cannot delete artists');

reset role;
select is((select count(*)::int from catalog.artists where name = 'hacked-qwyxel'), 0, 'no artist was changed by readers');

select * from finish();
rollback;
