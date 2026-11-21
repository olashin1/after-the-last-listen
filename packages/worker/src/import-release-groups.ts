// One-off Phase 1 import: MusicBrainz release-group JSON dump → catalog.artists / albums / album_artists.
//
//   pnpm catalog:import                 download (or reuse) the latest dump and load it
//   pnpm catalog:import --dry-run       stream and count only; no database writes
//   pnpm catalog:import --limit 50000   stop after N kept albums (quick local testing)
//   pnpm catalog:import --file <path>   use an already-downloaded release-group.tar.xz
//   pnpm catalog:import --date <YYYYMMDD-HHMMSS>   a specific dump instead of the latest
//
// Connects only to the local stack unless --allow-remote is given (see src/db.ts).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadAlbums } from "./catalog/load.ts";
import { connect } from "./db.ts";
import { ensureReleaseGroupDump, latestDumpDate, releaseGroupLines } from "./musicbrainz/dump.ts";
import { type MappedAlbum, mapReleaseGroup, type SkipReason } from "./musicbrainz/map.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "musicbrainz");

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

const stats = {
  lines: 0,
  kept: 0,
  badDates: 0,
  parseErrors: 0,
  credits: 0,
  skipped: { not_album_or_ep: 0, blank_title: 0, missing_id: 0 } as Record<SkipReason, number>,
};

async function* mapped(archive: string): AsyncGenerator<MappedAlbum> {
  for await (const line of releaseGroupLines(archive)) {
    stats.lines++;
    if (stats.lines % 250_000 === 0) log(`  read ${stats.lines.toLocaleString()} lines, kept ${stats.kept.toLocaleString()}`);
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      stats.parseErrors++;
      continue;
    }
    const result = mapReleaseGroup(json as Parameters<typeof mapReleaseGroup>[0]);
    if ("skipped" in result) {
      stats.skipped[result.skipped]++;
      continue;
    }
    stats.kept++;
    stats.credits += result.kept.credits.length;
    if (result.kept.badDate) stats.badDates++;
    yield result.kept;
    if (stats.kept >= limit) return;
  }
}

async function main() {
  const date = args.date ?? (args.file ? "local-file" : await latestDumpDate());
  const archive = args.file ?? (await ensureReleaseGroupDump(CACHE_DIR, date, log));
  log(`Dump: ${date} (${archive})`);

  if (args["dry-run"]) {
    for await (const album of mapped(archive)) void album;
    log("Dry run finished (no database writes).");
  } else {
    const sql = connect({ allowRemote: args["allow-remote"] });
    try {
      await loadAlbums(sql, mapped(archive), log); // Logs each step's counts as it goes.
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
