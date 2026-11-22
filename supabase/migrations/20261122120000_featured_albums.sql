-- Landing page cover wall (decided with the user, docs/decisions.md): a curated list of well-known
-- albums, kept as MBIDs in the web app (apps/web/lib/featured.ts), because the catalog's only
-- popularity signal (URL link count) ranks obscure albums first. This looks them up by MBID.
-- Catalog data is public, so anon may call it. It's security definer like search_albums: it only
-- reads catalog rows and returns public columns.

-- Albums for the given release-group MBIDs, in the order given. A merged album resolves to its
-- survivor; unknown and retired albums are skipped, and each album appears once. At most 24 MBIDs.
create function public.get_albums_by_mbid(p_mbids uuid[])
returns table (
  id bigint,
  mbid uuid,
  title text,
  artist_credit text,
  first_release_date text
)
language sql
stable
security definer
set search_path = ''
as $$
  with wanted as (
    select m.mbid, m.ord
    from unnest(p_mbids[1:24]) with ordinality as m(mbid, ord)
  ),
  resolved as (
    select distinct on (s.id) s.id, s.mbid, s.title, s.artist_credit, s.first_release_date, w.ord
    from wanted w
    join catalog.albums a on a.mbid = w.mbid
    join catalog.albums s on s.id = coalesce(a.merged_into_id, a.id)
    where not s.retired
    order by s.id, w.ord
  )
  select r.id, r.mbid, r.title, r.artist_credit, r.first_release_date
  from resolved r
  order by r.ord;
$$;

revoke execute on function public.get_albums_by_mbid(uuid[]) from public;
grant execute on function public.get_albums_by_mbid(uuid[]) to anon, authenticated;
