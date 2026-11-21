-- Profiles (PRD §6): one row per auth user.
-- Created by a trigger on sign-up. Edited only through update_profile(); clients cannot write the table directly.
-- Visibility decision (docs/decisions.md): the profile card is readable by everyone, even when private.
-- Private hides the user's collection, diary, ratings and reviews, enforced by can_view_user_content().

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.profile_visibility as enum ('public', 'private');

-- Username rule: 3–20 chars of a–z, 0–9, _. Stored lowercase, so plain uniqueness is case-insensitive.
create function public.is_valid_username(p_username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_username ~ '^[a-z0-9_]{3,20}$', false);
$$;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null
    constraint profiles_username_key unique
    constraint profiles_username_format check (public.is_valid_username(username)),
  display_name text
    constraint profiles_display_name_length check (char_length(display_name) between 1 and 50),
  bio text
    constraint profiles_bio_length check (char_length(bio) between 1 and 300),
  avatar_url text,
  visibility public.profile_visibility not null default 'public',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One profile per auth user. Written only by handle_new_user() and update_profile().';
comment on column public.profiles.avatar_url is 'Set by the avatar upload flow (not built yet).';

alter table public.profiles enable row level security;

-- Supabase grants table privileges to anon/authenticated by default. Allow reads only.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;

create policy "Profile cards are readable by everyone"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- Create the profile when an auth user is created. The username comes from sign-up metadata
-- (supabase.auth.signUp options.data.username). Invalid or taken usernames abort the sign-up.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, username)
  values (new.id, lower(btrim(new.raw_user_meta_data ->> 'username')));
  return new;
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  when check_violation or not_null_violation then
    raise exception 'invalid_username' using errcode = '22023';
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Sign-up pre-check, so the form can explain the problem before calling Auth.
-- Returns 'available', 'taken' or 'invalid'.
create function public.check_username(p_username text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when not public.is_valid_username(lower(btrim(p_username))) then 'invalid'
    when exists (select 1 from public.profiles where username = lower(btrim(p_username))) then 'taken'
    else 'available'
  end;
$$;

-- Edit the caller's own profile. Every field is replaced; empty display name or bio is stored as NULL.
-- Errors (message / SQLSTATE): not_authenticated 42501, username_taken 23505, invalid_username 22023,
-- display_name_too_long 22023, bio_too_long 22023, invalid_visibility 22023.
create function public.update_profile(
  p_username text,
  p_display_name text,
  p_bio text,
  p_visibility public.profile_visibility
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles;
  v_constraint text;
  v_column text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  begin
    update public.profiles
    set username     = lower(btrim(p_username)),
        display_name = nullif(btrim(p_display_name), ''),
        bio          = nullif(btrim(p_bio), ''),
        visibility   = p_visibility
    where user_id = v_uid
    returning * into v_row;
  exception
    when unique_violation then
      raise exception 'username_taken' using errcode = '23505';
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception '%', case v_constraint
          when 'profiles_username_format' then 'invalid_username'
          when 'profiles_display_name_length' then 'display_name_too_long'
          when 'profiles_bio_length' then 'bio_too_long'
          else 'invalid_profile'
        end
        using errcode = '22023';
    when not_null_violation then
      get stacked diagnostics v_column = column_name;
      raise exception '%', case v_column
          when 'username' then 'invalid_username'
          when 'visibility' then 'invalid_visibility'
          else 'invalid_profile'
        end
        using errcode = '22023';
  end;

  if v_row.user_id is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

-- Whether the current caller may see a user's private content (collection, diary, ratings, reviews).
-- Future tables use it in their RLS policies. Extend it for follows in the Social phase.
create function public.can_view_user_content(p_owner uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_owner = auth.uid(), false)
      or exists (
        select 1 from public.profiles
        where user_id = p_owner and visibility = 'public'
      );
$$;

-- Function privileges: Supabase grants EXECUTE on new functions to anon/authenticated by default.
revoke execute on function public.update_profile(text, text, text, public.profile_visibility) from public, anon;
grant execute on function public.update_profile(text, text, text, public.profile_visibility) to authenticated;

revoke execute on function public.check_username(text) from public;
grant execute on function public.check_username(text) to anon, authenticated;

revoke execute on function public.can_view_user_content(uuid) from public;
grant execute on function public.can_view_user_content(uuid) to anon, authenticated;

grant execute on function public.is_valid_username(text) to anon, authenticated;

revoke execute on function private.handle_new_user() from public, anon, authenticated;
