-- check_username(): sign-up pre-check, callable while signed out.
begin;
select plan(6);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}');

set local role anon;
select set_config('request.jwt.claims', '', true);

select is(public.check_username('newname'), 'available', 'a free valid username is available');
select is(public.check_username('alice'), 'taken', 'an existing username is taken');
select is(public.check_username(' ALICE '), 'taken', 'the check ignores case and surrounding spaces');
select is(public.check_username('a b'), 'invalid', 'invalid characters are reported as invalid');
select is(public.check_username(''), 'invalid', 'an empty username is invalid');
select is(public.check_username(null), 'invalid', 'a null username is invalid');

select * from finish();
rollback;
