// Load mapped release groups into the catalog: COPY into a session temp table (staging), then
// upsert everything in the same transaction, so search never sees a half-loaded catalog (PRD §7).
// Re-running with the same dump changes nothing: upserts skip rows whose values are unchanged.
//
// With `vanished` (the weekly sync), it also records active albums missing from the dump in
// catalog.sync_vanished for an API lookup (merge, deletion or dump lag; see catalog/vanished.ts).
// A safety guard aborts the whole transaction if the dump looks truncated, so a bad download can't
// retire the catalog: the previous catalog stays as it was and search keeps working.

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
  /** Albums back in the dump: un-retired (unless merged), or live albums now confirmed by the dump. */
  reactivated: number;
  /** Active albums missing from the dump, queued for lookup (only with `vanished`). */
  vanished: number;
};

export type VanishedOptions = {
  runId: number;
  /** Abort unless the dump has at least this share of the currently active albums (default 0.95). */
  minDumpShare?: number;
  /** Abort if more than this share of active albums vanished (default 0.02). */
  maxVanishedShare?: number;
};

export class DumpGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DumpGuardError";
  }
}

/** Pure guard check, so it can be unit-tested. Returns the reason to abort, or null. */
export function dumpGuardFailure(
  { activeBefore, staged, vanished }: { activeBefore: number; staged: number; vanished: number | null },
  { minDumpShare = 0.95, maxVanishedShare = 0.02 }: Pick<VanishedOptions, "minDumpShare" | "maxVanishedShare"> = {},
): string | null {
  if (activeBefore === 0) return null; // Empty catalog: the first import.
  if (staged < activeBefore * minDumpShare) {
    return `dump has ${staged.toLocaleString()} albums, under ${minDumpShare * 100}% of the ${activeBefore.toLocaleString()} active ones`;
  }
  if (vanished !== null && vanished > activeBefore * maxVanishedShare) {
    return `${vanished.toLocaleString()} active albums are missing from the dump, over ${maxVanishedShare * 100}% of ${activeBefore.toLocaleString()}`;
  }
  return null;
}

/** Phase 1 popularity proxy: log of the URL link count, scaled so 50+ links is 1.0. */
export const POPULARITY_SQL = "least(1.0, ln(1 + link_count) / ln(51))";

export async function loadAlbums(
  sql: Sql,
  albums: AsyncIterable<MappedAlbum>,
  log: (msg: string) => void,
  { vanished }: { vanished?: VanishedOptions } = {},
): Promise<LoadCounts> {
  return sql.begin(async (tx) => {
    const [{ active_before: activeBefore }] = (await tx`
      select count(*)::int as active_before from catalog.albums where not retired
    `) as unknown as [{ active_before: number }];

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
    if (vanished) {
      const failure = dumpGuardFailure({ activeBefore, staged, vanished: null }, vanished);
      if (failure) throw new DumpGuardError(`Dump looks truncated, nothing changed: ${failure}`);
    }

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

    // Back in the dump: un-retire (a merged album stays merged), and live albums become dump albums.
    const reactivated = await tx`
      update catalog.albums a
      set retired = case when a.merged_into_id is null then false else a.retired end, source = 'dump'
      from stg_albums s
      where a.mbid = s.mbid
        and ((a.retired and a.merged_into_id is null) or a.source = 'live')
    `;
    log(`Reactivated: ${reactivated.count.toLocaleString()} albums back in the dump.`);

    let vanishedCount = 0;
    if (vanished) {
      // Earlier lookups still pending for albums that are back: drop them.
      await tx`
        delete from catalog.sync_vanished v
        using catalog.albums a, stg_albums s
        where v.album_id = a.id and a.mbid = s.mbid
      `;
      // Live albums aren't checked: they may be newer than the dump.
      const missing = await tx`
        insert into catalog.sync_vanished (album_id, run_id)
        select a.id, ${vanished.runId}
        from catalog.albums a
        where not a.retired and a.source = 'dump'
          and not exists (select 1 from stg_albums s where s.mbid = a.mbid)
        on conflict (album_id) do update set run_id = excluded.run_id
      `;
      vanishedCount = missing.count;
      const failure = dumpGuardFailure({ activeBefore, staged, vanished: vanishedCount }, vanished);
      if (failure) throw new DumpGuardError(`Too many albums vanished, nothing changed: ${failure}`);
      log(`Vanished: ${vanishedCount.toLocaleString()} active albums missing from the dump, queued for lookup.`);
    }

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
      reactivated: reactivated.count,
      vanished: vanishedCount,
    };
  });
}
