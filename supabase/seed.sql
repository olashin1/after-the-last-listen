-- Local development seed data. Runs after migrations on `pnpm db:reset`. Never used on hosted Supabase.
--
-- Two confirmed test accounts, so testing doesn't need a sign-up and Mailpit after every reset:
--   alice@demo.test / password123   (username demo_alice, public profile)
--   bob@demo.test   / password123   (username demo_bob, private profile; for cross-user checks)
--   test@gmail.com  / 1234          (username tester, public profile; the user's own manual-testing account.
--                                    The password is under the 8-character minimum, which Auth only checks
--                                    at sign-up and password change, so seeding it still allows sign-in.)
-- Names differ from the SQL tests' fixtures (alice@example.com…), which must not collide.
-- The sign-up trigger (handle_new_user) creates their profiles from raw_user_meta_data.

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-8000-00000000a11c'::uuid, 'alice@demo.test', 'demo_alice', 'password123'),
      ('00000000-0000-4000-8000-000000000b0b'::uuid, 'bob@demo.test', 'demo_bob', 'password123'),
      ('00000000-0000-4000-8000-0000000007e5'::uuid, 'test@gmail.com', 'tester', '1234')
    ) as t(id, email, username, password)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      -- Auth reads these as strings; NULL breaks sign-in.
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt(u.password, extensions.gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}', jsonb_build_object('username', u.username), now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id, u.id::text, 'email',
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      now(), now(), now()
    );
  end loop;
end;
$$;

update public.profiles set display_name = 'Alice', bio = 'Seeded test account.' where username = 'demo_alice';
update public.profiles set display_name = 'Bob', visibility = 'private' where username = 'demo_bob';
