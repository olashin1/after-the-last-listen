-- Profile page sections (decided with the user, docs/decisions.md): "recently listened" and "recent
-- reviews" both come from get_collection(). It now also returns the album's review, and can return
-- only reviewed albums (p_reviewed_only). Order and keyset pagination are unchanged. Still security
-- invoker, so RLS keeps a private user's albums and reviews hidden from everyone but the owner.
-- The signature changes, so the function is dropped and recreated with the same privileges.

drop function public.get_collection(text, date, bigint, integer);

create function public.get_collection(
  p_username text,
  p_before_listened date default null,
  p_before_id bigint default null,
  p_lim integer default 48,
  p_reviewed_only boolean default false
)
returns table (
  user_album_id bigint,
  album_id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  first_release_date text,
  rating numeric,
  shooting_star_title text,
  listen_count integer,
  last_listened_on date,
  review text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ua.id, ua.album_id, a.mbid, a.title, a.artist_credit, a.first_release_date,
         ua.rating, ua.shooting_star_title, l.listen_count, l.last_listened_on, ua.review
  from public.profiles p
  join public.user_albums ua on ua.user_id = p.user_id
  join catalog.albums a on a.id = ua.album_id
  cross join lateral (
    select count(*)::integer as listen_count, max(x.listened_on) as last_listened_on
    from public.listens x
    where x.user_album_id = ua.id
  ) l
  where p.username = lower(btrim(p_username))
    and (not coalesce(p_reviewed_only, false) or ua.review is not null)
    and (p_before_listened is null or (l.last_listened_on, ua.id) < (p_before_listened, p_before_id))
  order by l.last_listened_on desc, ua.id desc
  limit least(greatest(coalesce(p_lim, 48), 1), 100);
$$;

revoke execute on function public.get_collection(text, date, bigint, integer, boolean) from public;
grant execute on function public.get_collection(text, date, bigint, integer, boolean) to anon, authenticated;
