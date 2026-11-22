-- Collection and diary (PRD §6 app layer, Phase 3): one user_albums row per user and album, and a
-- dated listens row for every listen. Clients only read these tables; every write goes through RPC
-- functions (log_album, log_again, update_user_album, remove_user_album) in later migrations.
-- Reads respect profile visibility through can_view_user_content() (docs/decisions.md, 2026-11-17).
--
-- Departure from PRD §6 (docs/decisions.md, Phase 3 plan): listens also store user_id, tied to the
-- parent row by a composite foreign key, so RLS and the diary index need no join.

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.touch_updated_at() from public, anon, authenticated;

create table public.user_albums (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  album_id bigint not null references catalog.albums (id),
  -- NULL is unrated; otherwise 0.5–5 in half steps (PRD §5).
  rating numeric(2, 1)
    constraint user_albums_rating_range check (rating between 0.5 and 5 and rating * 2 = trunc(rating * 2)),
  -- Blank reviews are stored as NULL by the write functions. 5,000 characters max (not in the PRD).
  review text
    constraint user_albums_review_length check (char_length(review) <= 5000 and btrim(review) <> ''),
  -- The Shooting Star (PRD §4): a recording on the album's canonical tracklist, checked by the write
  -- functions (catalog.tracks is a cache, so no foreign key). The title is copied so the pick always
  -- displays, even if upstream data changes or the tracklist isn't loaded.
  shooting_star_recording_mbid uuid,
  shooting_star_title text
    constraint user_albums_shooting_star_title_not_blank check (btrim(shooting_star_title) <> ''),
  created_at timestamptz not null default now(),
  -- Last edit of rating, review or Shooting Star; merges keep the most recently edited entry.
  updated_at timestamptz not null default now(),
  constraint user_albums_user_album_key unique (user_id, album_id),
  -- Target of the composite foreign key from listens.
  constraint user_albums_id_user_key unique (id, user_id),
  constraint user_albums_shooting_star_complete check (
    (shooting_star_recording_mbid is null) = (shooting_star_title is null)
  )
);

comment on table public.user_albums is
  'One collection record per user and album (PRD §6). Written only by RPC functions. "Date first added" is MIN(listens.listened_on), not a column.';

create index user_albums_album_id_idx on public.user_albums (album_id);

create trigger user_albums_touch_updated_at
  before update on public.user_albums
  for each row execute function private.touch_updated_at();

create table public.listens (
  id bigint generated always as identity primary key,
  user_album_id bigint not null,
  user_id uuid not null,
  -- The calendar day of the listen. Not in the future, checked by the write functions against the
  -- client's local date (PRD §9), which a table constraint can't know.
  listened_on date not null,
  -- Optional note from Log Again (Phase 4). 500 characters max (not in the PRD).
  note text
    constraint listens_note_length check (char_length(note) <= 500 and btrim(note) <> ''),
  -- Client-generated per submit, so a double tap or retry returns the existing listen instead of
  -- adding another (docs/decisions.md, Phase 3 plan). NULL for listens written without one.
  request_id uuid,
  created_at timestamptz not null default now(),
  constraint listens_user_album_fkey foreign key (user_album_id, user_id)
    references public.user_albums (id, user_id) on delete cascade,
  constraint listens_user_request_key unique (user_id, request_id)
);

comment on table public.listens is
  'One row per listen (PRD §6), including same-day repeats. Written only by RPC functions; deleted with its user_albums row.';

-- Diary: a user's listens newest first, with created_at and id as stable tie-breakers (PRD §6 Queries).
create index listens_diary_idx on public.listens (user_id, listened_on desc, created_at desc, id desc);
-- PRD §10: listens per album, e.g. first listen and listen counts.
create index listens_user_album_idx on public.listens (user_album_id, listened_on);

-- RLS: readable when the owner's content is visible to the caller (owner, or a public profile).
alter table public.user_albums enable row level security;
alter table public.listens enable row level security;

create policy "Collection is readable when the owner's content is visible"
  on public.user_albums
  for select
  to anon, authenticated
  using (public.can_view_user_content(user_id));

create policy "Listens are readable when the owner's content is visible"
  on public.listens
  for select
  to anon, authenticated
  using (public.can_view_user_content(user_id));

-- Supabase grants table privileges by default. Clients read only; the service role reads (the write
-- functions it needs, e.g. merges, get their own grants when they're added).
revoke all on public.user_albums, public.listens from public, anon, authenticated, service_role;
grant select on public.user_albums, public.listens to anon, authenticated, service_role;
