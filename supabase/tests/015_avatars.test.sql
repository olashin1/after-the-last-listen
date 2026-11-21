-- Avatars: the bucket's limits, storage.objects policies, set_avatar() and remove_avatar().
begin;
select plan(23);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"username": "alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"username": "bob"}');

-- Fixtures, as the migration owner: Bob's current avatar, and a file in another bucket under Alice's folder.
insert into storage.buckets (id, name) values ('not_avatars', 'not_avatars');
insert into storage.objects (bucket_id, name, owner_id) values
  ('avatars', '00000000-0000-0000-0000-00000000000b/bob.webp', '00000000-0000-0000-0000-00000000000b'),
  ('not_avatars', '00000000-0000-0000-0000-00000000000a/elsewhere.webp', '00000000-0000-0000-0000-00000000000a');
update public.profiles set avatar_url = '00000000-0000-0000-0000-00000000000b/bob.webp' where username = 'bob';

select ok(
  (select public and file_size_limit = 2097152
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
   from storage.buckets where id = 'avatars'),
  'avatars bucket is public, 2 MB max, JPEG/PNG/WebP only'
);

-- Signed out.
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000a/x.webp')$$,
  '42501', null,
  'anon cannot upload avatar files'
);
select throws_ok($$select public.set_avatar('00000000-0000-0000-0000-00000000000b/bob.webp')$$, '42501', null, 'anon cannot call set_avatar');
select throws_ok($$select public.remove_avatar()$$, '42501', null, 'anon cannot call remove_avatar');

-- Signed in as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values
      ('avatars', '00000000-0000-0000-0000-00000000000a/one.webp', '00000000-0000-0000-0000-00000000000a'),
      ('avatars', '00000000-0000-0000-0000-00000000000a/two.jpg', '00000000-0000-0000-0000-00000000000a'),
      ('avatars', '00000000-0000-0000-0000-00000000000a/temp.png', '00000000-0000-0000-0000-00000000000a')$$,
  'a user can upload files to their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values
      ('avatars', '00000000-0000-0000-0000-00000000000b/evil.webp', '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null,
  'a user cannot upload into another user''s folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values
      ('avatars', 'loose.webp', '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null,
  'a user cannot upload outside a user folder'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-00000000000b/%'),
  0,
  'a user cannot list another user''s avatar files'
);

-- Attempts on Bob's file affect no rows (checked below as the owner).
update storage.objects set name = '00000000-0000-0000-0000-00000000000b/hijacked.webp'
  where name = '00000000-0000-0000-0000-00000000000b/bob.webp';
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name = '00000000-0000-0000-0000-00000000000b/bob.webp';
delete from storage.objects where name = '00000000-0000-0000-0000-00000000000a/temp.png';

select is(
  public.set_avatar('00000000-0000-0000-0000-00000000000a/one.webp'),
  null,
  'set_avatar returns NULL when there was no previous avatar'
);
select is(
  (select avatar_url from public.profiles where username = 'alice'),
  '00000000-0000-0000-0000-00000000000a/one.webp',
  'set_avatar saves the path'
);
select is(
  public.set_avatar('00000000-0000-0000-0000-00000000000a/two.jpg'),
  '00000000-0000-0000-0000-00000000000a/one.webp',
  'set_avatar returns the previous path'
);
select is(
  public.set_avatar('00000000-0000-0000-0000-00000000000a/two.jpg'),
  null,
  'setting the same path again returns NULL, so the current file is never deleted'
);
select throws_ok(
  $$select public.set_avatar('00000000-0000-0000-0000-00000000000b/bob.webp')$$,
  '22023', 'invalid_avatar',
  'a user cannot use another user''s file'
);
select throws_ok(
  $$select public.set_avatar('00000000-0000-0000-0000-00000000000a/missing.webp')$$,
  '22023', 'invalid_avatar',
  'set_avatar rejects a file that was never uploaded'
);
select throws_ok(
  $$select public.set_avatar('00000000-0000-0000-0000-00000000000a/temp.png')$$,
  '22023', 'invalid_avatar',
  'set_avatar rejects a deleted file'
);
select throws_ok(
  $$select public.set_avatar('00000000-0000-0000-0000-00000000000a/elsewhere.webp')$$,
  '22023', 'invalid_avatar',
  'set_avatar rejects a file from another bucket'
);
select throws_ok(
  $$select public.set_avatar('00000000-0000-0000-0000-00000000000a/../00000000-0000-0000-0000-00000000000b/bob.webp')$$,
  '22023', 'invalid_avatar',
  'set_avatar rejects path tricks'
);
select throws_ok($$select public.set_avatar(null)$$, '22023', 'invalid_avatar', 'set_avatar rejects NULL');

select is(
  public.remove_avatar(),
  '00000000-0000-0000-0000-00000000000a/two.jpg',
  'remove_avatar returns the previous path'
);
select is(
  (select avatar_url from public.profiles where username = 'alice'),
  null,
  'remove_avatar clears the path'
);

-- Back to the owner to check nothing of Bob's changed.
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select avatar_url from public.profiles where username = 'bob'),
  '00000000-0000-0000-0000-00000000000b/bob.webp',
  'another user''s avatar is unchanged'
);
select ok(
  exists (select 1 from storage.objects where bucket_id = 'avatars' and name = '00000000-0000-0000-0000-00000000000b/bob.webp'),
  'a user cannot rename or delete another user''s file'
);
select ok(
  not exists (select 1 from storage.objects where name = '00000000-0000-0000-0000-00000000000a/temp.png'),
  'a user can delete their own file'
);

select * from finish();
rollback;
