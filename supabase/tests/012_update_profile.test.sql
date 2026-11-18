-- update_profile(): edits only the caller's own profile and validates every field.
begin;
select plan(15);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');

-- Signed out.
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$select public.update_profile('alice', null, null, 'public')$$,
  '42501', null,
  'anon cannot call update_profile'
);

-- Signed in as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select is(
  (select username from public.update_profile(' Alice_New ', ' Alice ', ' Hello. ', 'private')),
  'alice_new',
  'update returns the saved row with a normalized username'
);
select ok(
  (select display_name = 'Alice' and bio = 'Hello.' and visibility = 'private'
   from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  'display name, bio and visibility are saved trimmed'
);
select is(public.check_username('alice'), 'available', 'the old username is free again after a rename');

select lives_ok(
  $$select public.update_profile('alice_new', '', '   ', 'public')$$,
  'empty display name and bio are accepted'
);
select ok(
  (select display_name is null and bio is null
   from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  'empty display name and bio are stored as NULL'
);

select throws_ok(
  $$select public.update_profile('BOB', null, null, 'public')$$,
  '23505', 'username_taken',
  'another user''s username is rejected, in any case'
);
select throws_ok(
  $$select public.update_profile('bad name!', null, null, 'public')$$,
  '22023', 'invalid_username',
  'an invalid username is rejected'
);
select throws_ok(
  $$select public.update_profile(null, null, null, 'public')$$,
  '22023', 'invalid_username',
  'a missing username is rejected'
);
select throws_ok(
  $$select public.update_profile('alice_new', repeat('x', 51), null, 'public')$$,
  '22023', 'display_name_too_long',
  'a display name over 50 characters is rejected'
);
select throws_ok(
  $$select public.update_profile('alice_new', null, repeat('x', 301), 'public')$$,
  '22023', 'bio_too_long',
  'a bio over 300 characters is rejected'
);
select throws_ok(
  $$select public.update_profile('alice_new', null, null, null)$$,
  '22023', 'invalid_visibility',
  'a missing visibility is rejected'
);
select lives_ok(
  $$select public.update_profile('alice_new', repeat('x', 50), repeat('y', 300), 'public')$$,
  'display name of 50 and bio of 300 characters are accepted'
);

-- Signed in as a user with no profile row.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000ff", "role": "authenticated"}', true);
select throws_ok(
  $$select public.update_profile('ghost', null, null, 'public')$$,
  'P0002', 'profile_not_found',
  'a caller without a profile gets profile_not_found'
);

reset role;
select ok(
  (select username = 'bob' and display_name is null and bio is null and visibility = 'public'
   from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'),
  'none of Alice''s calls changed bob''s profile'
);

select * from finish();
rollback;
