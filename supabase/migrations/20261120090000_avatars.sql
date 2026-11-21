-- Avatars (PRD §4 profile, §8 "Supabase Storage: limit size/type").
-- Files live in the public `avatars` bucket at `{user_id}/{random}.{ext}`; a new name per upload,
-- so caches never serve a stale image. profiles.avatar_url stores that object path, not a full URL.
-- The browser crops/resizes to 512px before upload; the bucket limits below are the real enforcement.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

comment on column public.profiles.avatar_url is
  'Object path in the avatars bucket ({user_id}/{file}), or NULL. Set only by set_avatar() / remove_avatar().';

-- storage.objects policies: a signed-in user manages files in their own folder only.
-- Public reads go through the public bucket URL, which doesn't use these policies.
create policy "Users can read their own avatar files"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can upload avatar files to their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can update their own avatar files"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own avatar files"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Point the caller's profile at an avatar file they already uploaded.
-- Returns the previous path (or NULL) so the caller can delete the old file through the Storage API
-- (direct deletes from storage.objects are blocked). The row lock makes "previous" exact.
-- Errors (message / SQLSTATE): not_authenticated 42501, invalid_avatar 22023, profile_not_found P0002.
create function public.set_avatar(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_previous text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_path is null
     or p_path !~ ('^' || v_uid::text || '/[A-Za-z0-9_-]+\.(jpg|png|webp)$')
     or not exists (
       select 1 from storage.objects
       where bucket_id = 'avatars' and name = p_path and owner_id = v_uid::text
     ) then
    raise exception 'invalid_avatar' using errcode = '22023';
  end if;

  select avatar_url into v_previous from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  update public.profiles set avatar_url = p_path where user_id = v_uid;
  return nullif(v_previous, p_path);
end;
$$;

-- Clear the caller's avatar. Returns the previous path (or NULL) for the caller to delete.
create function public.remove_avatar()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_previous text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select avatar_url into v_previous from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  update public.profiles set avatar_url = null where user_id = v_uid;
  return v_previous;
end;
$$;

revoke execute on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;

revoke execute on function public.remove_avatar() from public, anon;
grant execute on function public.remove_avatar() to authenticated;
