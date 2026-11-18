-- handle_new_user(): a profile is created on sign-up, and bad usernames abort the sign-up.
begin;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "  Alice_1 "}');

select is(
  (select username from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  'alice_1',
  'sign-up creates a profile with the username trimmed and lowercased'
);
select is(
  (select visibility::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  'public',
  'new profiles are public by default'
);
select ok(
  (select display_name is null and bio is null and avatar_url is null
   from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  'optional fields start empty'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"username": "ALICE_1"}')$$,
  '23505', 'username_taken',
  'a username taken in a different case is rejected'
);
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"username": "no spaces"}')$$,
  '22023', 'invalid_username',
  'a username with invalid characters is rejected'
);
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"username": "ab"}')$$,
  '22023', 'invalid_username',
  'a username shorter than 3 characters is rejected'
);
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"username": "abcdefghijklmnopqrstu"}')$$,
  '22023', 'invalid_username',
  'a username longer than 20 characters is rejected'
);
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{}')$$,
  '22023', 'invalid_username',
  'sign-up without a username is rejected'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is_empty(
  $$select 1 from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'deleting the auth user deletes the profile'
);

select * from finish();
rollback;
