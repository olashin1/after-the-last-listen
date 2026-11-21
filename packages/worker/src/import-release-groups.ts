// One-off import: MusicBrainz release-group JSON dump → catalog.artists / albums / album_artists.
// The weekly sync (`pnpm catalog:sync`) does this too, plus retirement, canonical releases and merges.
//
//   pnpm catalog:import                 download (or reuse) the latest dump and load it
//   pnpm catalog:import --dry-run       stream and count only; no database writes
//   pnpm catalog:import --limit 50000   stop after N kept albums (quick local testing)
//   pnpm catalog:import --file <path>   use an already-downloaded release-group.tar.xz
//   pnpm catalog:import --date <YYYYMMDD-HHMMSS>   a specific dump instead of the latest
//
// Connects only to the local stack unless --allow-remote is given (see src/db.ts).

import { parseArgs } from "node:util";
import { loadAlbums } from "./catalog/load.ts";
import { connect } from "./db.ts";
import { CACHE_DIR } from "./paths.ts";
import { ensureReleaseGroupDump, latestDumpDate } from "./musicbrainz/dump.ts";
import { readReleaseGroups } from "./musicbrainz/release-groups.ts";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    limit: { type: "string" },
    file: { type: "string" },
    date: { type: "string" },
    "allow-remote": { type: "boolean", default: false },
  },
});

const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;
const log = (msg: string) => console.log(`[${elapsed()}] ${msg}`);

const limit = args.limit ? Number(args.limit) : Infinity;
if (!(limit > 0)) throw new Error("--limit must be a positive number");

async function main() {
  const date = args.date ?? (args.file ? "local-file" : await latestDumpDate());
  const archive = args.file ?? (await ensureReleaseGroupDump(CACHE_DIR, date, log));
  log(`Dump: ${date} (${archive})`);
  const { albums, stats } = readReleaseGroups(archive, { limit, log });

  if (args["dry-run"]) {
    for await (const album of albums) void album;
    log("Dry run finished (no database writes).");
  } else {
    const sql = connect({ allowRemote: args["allow-remote"] });
    try {
      await loadAlbums(sql, albums, log); // Logs each step's counts as it goes.
      log("Committed.");
    } finally {
      await sql.end();
    }
  }

  console.log(
    JSON.stringify({ dump: date, ...stats, limit: Number.isFinite(limit) ? limit : null, seconds: (Date.now() - started) / 1000 }, null, 2),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
