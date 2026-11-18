-- can_view_user_content(): who may see a user's private content (used by future RLS policies).
begin;
select plan(6);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');
update public.profiles set visibility = 'private' where username = 'bob';

-- Signed out.
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(public.can_view_user_content('00000000-0000-0000-0000-00000000000a'), true, 'anon can view a public user''s content');
select is(public.can_view_user_content('00000000-0000-0000-0000-00000000000b'), false, 'anon cannot view a private user''s content');
select is(public.can_view_user_content('00000000-0000-0000-0000-0000000000ff'), false, 'an unknown user has no visible content');

-- Signed in as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(public.can_view_user_content('00000000-0000-0000-0000-00000000000b'), false, 'another user cannot view a private user''s content');

-- Signed in as Bob.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(public.can_view_user_content('00000000-0000-0000-0000-00000000000b'), true, 'a private user can view their own content');
select is(public.can_view_user_content('00000000-0000-0000-0000-00000000000a'), true, 'a signed-in user can view a public user''s content');

select * from finish();
rollback;
