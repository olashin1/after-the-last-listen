// Load MusicBrainz's canonical release mapping into catalog.albums.canonical_release_mbid
// (PRD §6 "Album identity and editions"): which release's tracklist each album page shows.
//
//   pnpm catalog:canonical                  download (or reuse) the latest canonical dump and load it
//   pnpm catalog:canonical --folder <name>  a specific dump, e.g. musicbrainz-canonical-dump-20261117-080003
//
// Run after `pnpm catalog:import`. Only updates albums whose canonical release changed, in one
// transaction. Albums whose stored tracks came from another release show as stale (get_album's
// tracks_current) and reload on their next page view.

import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { copyRow } from "./catalog/copy.ts";
import { connect } from "./db.ts";
import { CANONICAL_RELEASE_MEMBER, parseCanonicalReleaseLine } from "./musicbrainz/canonical.ts";
import { archiveLines, ensureCanonicalDump, latestCanonicalDump } from "./musicbrainz/dump.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "musicbrainz");

const { values: args } = parseArgs({
  options: {
    folder: { type: "string" },
    "allow-remote": { type: "boolean", default: false },
  },
});

const started = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);

async function main() {
  const folder = args.folder ?? (await latestCanonicalDump());
  const archive = await ensureCanonicalDump(CACHE_DIR, folder, log);
  log(`Canonical dump: ${folder}`);

  const sql = connect({ allowRemote: args["allow-remote"] });
  let lines = 0;
  let skipped = 0;
  try {
    await sql.begin(async (tx) => {
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
    });
    log("Committed.");
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
