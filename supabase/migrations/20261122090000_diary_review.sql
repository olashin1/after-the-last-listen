-- Diary rows show the album's review (decided with the user, docs/decisions.md). A review belongs to
-- the collection record, not to one listen, so it comes back only on that album's most recent listen
-- (same order as the diary: listened_on, then created_at and id); older rows of the same album get
-- NULL, so a re-logged album doesn't repeat its review down the diary.
-- The return type changes, so the function is dropped and recreated (same arguments and privileges).

drop function public.get_diary(text, date, timestamptz, bigint, integer);

create function public.get_diary(
  p_username text,
  p_before_listened date default null,
  p_before_created timestamptz default null,
  p_before_id bigint default null,
  p_lim integer default 50
)
returns table (
  listen_id bigint,
  listened_on date,
  note text,
  created_at timestamptz,
  album_id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  first_release_date text,
  rating numeric,
  shooting_star_title text,
  review text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.listened_on, l.note, l.created_at, ua.album_id, a.mbid, a.title, a.artist_credit,
         a.first_release_date, ua.rating, ua.shooting_star_title,
         case when l.id = latest.id then ua.review end
  from public.profiles p
  join public.listens l on l.user_id = p.user_id
  join public.user_albums ua on ua.id = l.user_album_id
  join catalog.albums a on a.id = ua.album_id
  cross join lateral (
    select x.id
    from public.listens x
    where x.user_album_id = ua.id
    order by x.listened_on desc, x.created_at desc, x.id desc
    limit 1
  ) latest
  where p.username = lower(btrim(p_username))
    and (p_before_listened is null
         or (l.listened_on, l.created_at, l.id) < (p_before_listened, p_before_created, p_before_id))
  order by l.listened_on desc, l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_lim, 50), 1), 100);
$$;

revoke execute on function public.get_diary(text, date, timestamptz, bigint, integer) from public;
grant execute on function public.get_diary(text, date, timestamptz, bigint, integer) to anon, authenticated;
