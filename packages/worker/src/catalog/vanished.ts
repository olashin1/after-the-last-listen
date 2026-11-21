// Resolve albums that vanished from the dump (catalog.sync_vanished) by looking each one up in the
// MusicBrainz API, one at a time, outside any long transaction:
//   merged into another release group → catalog.apply_album_redirect(old, new)
//   deleted, or no longer an Album/EP → catalog.retire_album(id)
//   still there                       → keep (the dump was behind); drop it from the queue
// Albums still queued stay searchable until they're resolved. Whatever is left over (the per-run cap,
// or MusicBrainz errors) waits for the next run.

import { type MusicBrainzClient, MusicBrainzError } from "@atll/musicbrainz";
import type { Sql } from "../db.ts";
import { classifyLookup, type LookupResult } from "../musicbrainz/lookup.ts";

export type VanishedCounts = {
  looked_up: number;
  merged: number;
  renamed: number;
  retired_deleted: number;
  retired_not_album: number;
  kept: number;
  errors: number;
  remaining: number;
};

/** Stop the run after this many lookup errors in a row (MusicBrainz down or blocking us). */
const MAX_CONSECUTIVE_ERRORS = 5;

export async function resolveVanished(
  sql: Sql,
  mb: MusicBrainzClient,
  { max, log }: { max: number; log: (msg: string) => void },
): Promise<VanishedCounts> {
  const counts: VanishedCounts = {
    looked_up: 0,
    merged: 0,
    renamed: 0,
    retired_deleted: 0,
    retired_not_album: 0,
    kept: 0,
    errors: 0,
    remaining: 0,
  };
  const queue = await sql<{ album_id: number; mbid: string }[]>`
    select v.album_id::int as album_id, a.mbid::text as mbid
    from catalog.sync_vanished v
    join catalog.albums a on a.id = v.album_id
    order by v.found_at, v.album_id
    limit ${max}
  `;
  if (queue.length > 0) log(`Looking up ${queue.length.toLocaleString()} vanished albums in the MusicBrainz API…`);

  let consecutiveErrors = 0;
  for (const [i, { album_id, mbid }] of queue.entries()) {
    let result: LookupResult;
    try {
      result = { found: true, body: await mb.get(`release-group/${mbid}`) };
    } catch (err) {
      if (err instanceof MusicBrainzError && err.status === 404) {
        result = { found: false };
      } else {
        counts.errors++;
        consecutiveErrors++;
        log(`  lookup failed for ${mbid}: ${err instanceof Error ? err.message : err}`);
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log(`  ${MAX_CONSECUTIVE_ERRORS} lookups failed in a row; stopping until the next run.`);
          break;
        }
        continue;
      }
    }
    consecutiveErrors = 0;
    counts.looked_up++;

    const action = classifyLookup(mbid, result);
    if (action.action === "redirect") {
      const [{ outcome }] = (await sql`
        select catalog.apply_album_redirect(${mbid}::uuid, ${action.newMbid}::uuid) as outcome
      `) as unknown as [{ outcome: string }];
      if (outcome === "merged") counts.merged++;
      else counts.renamed++;
    } else if (action.action === "retire") {
      await sql`select catalog.retire_album(${album_id})`;
      if (action.reason === "deleted") counts.retired_deleted++;
      else counts.retired_not_album++;
    } else {
      await sql`delete from catalog.sync_vanished where album_id = ${album_id}`;
      counts.kept++;
    }
    if ((i + 1) % 100 === 0) log(`  ${(i + 1).toLocaleString()} of ${queue.length.toLocaleString()} looked up`);
  }

  const [{ remaining }] = (await sql`select count(*)::int as remaining from catalog.sync_vanished`) as unknown as [
    { remaining: number },
  ];
  counts.remaining = remaining;
  log(
    `Vanished albums: ${counts.merged} merged, ${counts.renamed} renamed, ${counts.retired_deleted} deleted, ` +
      `${counts.retired_not_album} no longer albums, ${counts.kept} kept, ${counts.errors} errors, ${remaining} still queued.`,
  );
  return counts;
}
