// Load MusicBrainz's canonical release mapping into catalog.albums.canonical_release_mbid
// (PRD §6 "Album identity and editions"): which release's tracklist each album page shows.
// Only albums whose canonical release changed are updated, in one transaction. Albums whose stored
// tracks came from another release show as stale (get_album's tracks_current) and reload on their
// next page view.

import { once } from "node:events";
import type { Sql } from "../db.ts";
import { CANONICAL_RELEASE_MEMBER, parseCanonicalReleaseLine } from "../musicbrainz/canonical.ts";
import { archiveLines } from "../musicbrainz/dump.ts";
import { copyRow } from "./copy.ts";

export type CanonicalCounts = { lines: number; skipped: number; changed: number; withCanonical: number; total: number };

export async function loadCanonical(sql: Sql, archive: string, folder: string, log: (msg: string) => void): Promise<CanonicalCounts> {
  let lines = 0;
  let skipped = 0;
  return sql.begin(async (tx) => {
    await tx`create temp table stg_canonical (release_group_mbid uuid not null, canonical_release_mbid uuid not null) on commit drop`;
    const stream = await tx`copy stg_canonical (release_group_mbid, canonical_release_mbid) from stdin`.writable();
    const done = once(stream, "finish");
    // The CSV has one row per release; consecutive rows of one release group repeat the same
    // canonical release, so skip repeats here to stage roughly one row per release group.
    let lastGroup = "";
    for await (const line of archiveLines(archive, CANONICAL_RELEASE_MEMBER(folder))) {
      lines++;
      if (lines % 2_000_000 === 0) log(`  read ${lines.toLocaleString()} lines`);
      const row = parseCanonicalReleaseLine(line);
      if (!row) {
        skipped++;
        continue;
      }
      if (row.releaseGroupMbid === lastGroup) continue;
      lastGroup = row.releaseGroupMbid;
      if (!stream.write(copyRow([row.releaseGroupMbid, row.canonicalReleaseMbid]))) await once(stream, "drain");
    }
    stream.end();
    await done;
    log(`Read ${lines.toLocaleString()} lines (${skipped} header/malformed). Updating albums…`);

    const updated = await tx`
      update catalog.albums a
      set canonical_release_mbid = s.canonical_release_mbid
      from (
        select distinct on (release_group_mbid) release_group_mbid, canonical_release_mbid
        from stg_canonical
        order by release_group_mbid
      ) s
      where a.mbid = s.release_group_mbid
        and a.canonical_release_mbid is distinct from s.canonical_release_mbid
    `;
    log(`Albums with a new or changed canonical release: ${updated.count.toLocaleString()}.`);

    const [coverage] = await tx`
      select count(*) filter (where canonical_release_mbid is not null)::int as with_canonical, count(*)::int as total
      from catalog.albums
    `;
    log(`Coverage: ${coverage!.with_canonical.toLocaleString()} of ${coverage!.total.toLocaleString()} albums have a canonical release.`);
    return { lines, skipped, changed: updated.count, withCanonical: coverage!.with_canonical, total: coverage!.total };
  });
}
