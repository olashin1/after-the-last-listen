-- profiles RLS and privileges: everyone can read cards; nobody can write the table directly.
begin;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');
update public.profiles set visibility = 'private' where username = 'bob';

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);

-- Signed out.
set local role anon;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$select username from public.profiles
    where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')
    order by username$$,
  $$values ('alice'::text), ('bob'::text)$$,
  'anon can read public and private profile cards'
);
select throws_ok(
  $$update public.profiles set bio = 'hacked' where username = 'alice'$$,
  '42501', null,
  'anon cannot update profiles'
);

-- Signed in as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select throws_ok(
  $$update public.profiles set bio = 'hi' where username = 'alice'$$,
  '42501', null,
  'a user cannot update even their own row directly (writes go through update_profile)'
);
select throws_ok(
  $$update public.profiles set bio = 'hacked' where username = 'bob'$$,
  '42501', null,
  'a user cannot update another user''s profile directly'
);
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('00000000-0000-0000-0000-00000000000c', 'mallory')$$,
  '42501', null,
  'a user cannot insert profiles directly'
);
select throws_ok(
  $$delete from public.profiles where username = 'bob'$$,
  '42501', null,
  'a user cannot delete another user''s profile'
);
select throws_ok(
  $$select private.handle_new_user()$$,
  '42501', null,
  'clients cannot call the private sign-up trigger function'
);

reset role;
select is(
  (select bio from public.profiles where username = 'bob'),
  null,
  'bob''s profile is unchanged'
);

select * from finish();
rollback;
