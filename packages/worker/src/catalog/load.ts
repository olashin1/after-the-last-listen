// Load mapped release groups into the catalog: COPY into a session temp table (staging), then
// upsert everything in the same transaction, so search never sees a half-loaded catalog (PRD §7).
// Re-running with the same dump changes nothing: upserts skip rows whose values are unchanged.
//
// Not done here (Phase 2 sync worker): retiring albums that disappeared upstream, MBID redirects.

import { once } from "node:events";
import type { MappedAlbum } from "../musicbrainz/map.ts";
import type { Sql } from "../db.ts";
import { copyRow } from "./copy.ts";

/** Rows written by each step. All zero when re-running the same dump. */
export type LoadCounts = {
  staged: number;
  artistsChanged: number;
  albumsChanged: number;
  creditsRemoved: number;
  creditsAdded: number;
  popularityChanged: number;
};

/** Phase 1 popularity proxy: log of the URL link count, scaled so 50+ links is 1.0. */
export const POPULARITY_SQL = "least(1.0, ln(1 + link_count) / ln(51))";

export async function loadAlbums(
  sql: Sql,
  albums: AsyncIterable<MappedAlbum>,
  log: (msg: string) => void,
): Promise<LoadCounts> {
  return sql.begin(async (tx) => {
    await tx`
      create temp table stg_albums (
        mbid uuid not null,
        title text not null,
        artist_credit text not null,
        primary_type text not null,
        secondary_types jsonb not null,
        first_release_date text,
        link_count integer not null,
        credits jsonb not null
      ) on commit drop
    `;

    log("Staging rows with COPY…");
    const stream = await tx`
      copy stg_albums (mbid, title, artist_credit, primary_type, secondary_types, first_release_date, link_count, credits)
      from stdin
    `.writable();
    const done = once(stream, "finish");
    let staged = 0;
    for await (const a of albums) {
      const row = copyRow([
        a.mbid,
        a.title,
        a.artistCredit,
        a.primaryType,
        JSON.stringify(a.secondaryTypes),
        a.firstReleaseDate,
        a.linkCount,
        JSON.stringify(
          a.credits.map((c) => ({
            artist_mbid: c.artistMbid,
            name: c.name,
            sort_name: c.sortName,
            disambiguation: c.disambiguation,
            position: c.position,
          })),
        ),
      ]);
      if (!stream.write(row)) await once(stream, "drain");
      staged++;
    }
    stream.end();
    await done;
    log(`Staged ${staged.toLocaleString()} albums. Upserting…`);

    await tx`create index on stg_albums (mbid)`;
    await tx`analyze stg_albums`;

    await tx`
      create temp table stg_credits on commit drop as
      select s.mbid as album_mbid, c.artist_mbid, c.name, c.sort_name, c.disambiguation, c.position
      from stg_albums s,
           jsonb_to_recordset(s.credits) as c(artist_mbid uuid, name text, sort_name text, disambiguation text, position smallint)
    `;
    await tx`analyze stg_credits`;

    // Artists: one row per MBID (the same artist is credited on many albums).
    // Upserts skip unchanged rows (the WHERE on DO UPDATE), so counts are new + changed rows.
    const artists = await tx`
      insert into catalog.artists (mbid, name, sort_name, disambiguation)
      select distinct on (artist_mbid) artist_mbid, name, sort_name, disambiguation
      from stg_credits
      order by artist_mbid, album_mbid
      on conflict (mbid) do update
        set name = excluded.name, sort_name = excluded.sort_name, disambiguation = excluded.disambiguation
        where (catalog.artists.name, catalog.artists.sort_name, catalog.artists.disambiguation)
              is distinct from (excluded.name, excluded.sort_name, excluded.disambiguation)
    `;
    log(`Artists: ${artists.count.toLocaleString()} new or changed.`);

    const albumRows = await tx`
      insert into catalog.albums (mbid, title, artist_credit, primary_type, secondary_types, first_release_date, link_count)
      select distinct on (mbid) mbid, title, artist_credit, primary_type,
             array(select jsonb_array_elements_text(secondary_types)), first_release_date, link_count
      from stg_albums
      order by mbid
      on conflict (mbid) do update
        set title = excluded.title, artist_credit = excluded.artist_credit, primary_type = excluded.primary_type,
            secondary_types = excluded.secondary_types, first_release_date = excluded.first_release_date,
            link_count = excluded.link_count
        where (catalog.albums.title, catalog.albums.artist_credit, catalog.albums.primary_type,
               catalog.albums.secondary_types, catalog.albums.first_release_date, catalog.albums.link_count)
              is distinct from
              (excluded.title, excluded.artist_credit, excluded.primary_type,
               excluded.secondary_types, excluded.first_release_date, excluded.link_count)
    `;
    log(`Albums: ${albumRows.count.toLocaleString()} new or changed.`);

    // Credits: make album_artists match the dump for every imported album, touching only differences.
    await tx`
      create temp table want_credits on commit drop as
      select distinct on (al.id, ar.id) al.id as album_id, ar.id as artist_id, c.position
      from stg_credits c
      join catalog.albums al on al.mbid = c.album_mbid
      join catalog.artists ar on ar.mbid = c.artist_mbid
      order by al.id, ar.id, c.position
    `;
    await tx`create index on want_credits (album_id, artist_id)`;
    await tx`analyze want_credits`;

    const deleted = await tx`
      delete from catalog.album_artists aa
      using catalog.albums al, stg_albums s
      where aa.album_id = al.id and al.mbid = s.mbid
        and not exists (
          select 1 from want_credits w
          where w.album_id = aa.album_id and w.artist_id = aa.artist_id and w.position = aa.position
        )
    `;
    const inserted = await tx`
      insert into catalog.album_artists (album_id, artist_id, position)
      select album_id, artist_id, position from want_credits
      on conflict do nothing
    `;
    log(`Credits: ${deleted.count.toLocaleString()} removed, ${inserted.count.toLocaleString()} added.`);

    const popularity = await tx.unsafe(`
      update catalog.albums set popularity = ${POPULARITY_SQL}
      where popularity is distinct from ${POPULARITY_SQL}
    `);
    log(`Popularity recomputed for ${popularity.count.toLocaleString()} albums.`);

    return {
      staged,
      artistsChanged: artists.count,
      albumsChanged: albumRows.count,
      creditsRemoved: deleted.count,
      creditsAdded: inserted.count,
      popularityChanged: popularity.count,
    };
  });
}
