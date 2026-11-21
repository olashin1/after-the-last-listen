// Weekly catalog sync (PRD §7 "Sync pipeline"): the one command the schedule runs.
//
//   pnpm catalog:sync                        latest release-group + canonical dumps, then merge lookups
//   pnpm catalog:sync --date <YYYYMMDD-HHMMSS>   a specific release-group dump
//   pnpm catalog:sync --file <path>          an already-downloaded release-group.tar.xz
//   pnpm catalog:sync --canonical-folder <name>  a specific canonical dump
//   pnpm catalog:sync --skip-canonical       don't load canonical releases this run
//   pnpm catalog:sync --max-lookups 200      cap MusicBrainz API lookups of vanished albums (default 1500)
//   pnpm catalog:sync --lookups-only         only retry the vanished albums still queued (no downloads)
//   pnpm catalog:sync --allow-remote         required for a non-local DATABASE_URL (the scheduled run)
//
// Steps, each committed on its own so a failure anywhere leaves the previous catalog searchable:
//   1. release groups: upsert the dump, reactivate albums that are back, queue vanished albums
//      (aborts without changes if the dump looks truncated)
//   2. canonical releases
//   3. look up vanished albums: merge, retire or keep
// Progress and counts go to catalog.sync_runs. Only one sync runs at a time (advisory lock).

import { parseArgs } from "node:util";
import { createMusicBrainzClient } from "@atll/musicbrainz";
import { pruneDownloads } from "./cache.ts";
import { loadCanonical } from "./catalog/canonical.ts";
import { loadAlbums } from "./catalog/load.ts";
import { resolveVanished } from "./catalog/vanished.ts";
import { connect } from "./db.ts";
import { ensureCanonicalDump, ensureReleaseGroupDump, latestCanonicalDump, latestDumpDate } from "./musicbrainz/dump.ts";
import { readReleaseGroups } from "./musicbrainz/release-groups.ts";
import { CACHE_DIR } from "./paths.ts";

const { values: args } = parseArgs({
  options: {
    date: { type: "string" },
    file: { type: "string" },
    "canonical-folder": { type: "string" },
    "skip-canonical": { type: "boolean", default: false },
    "lookups-only": { type: "boolean", default: false },
    "max-lookups": { type: "string", default: "1500" },
    "allow-remote": { type: "boolean", default: false },
  },
});

const maxLookups = Number(args["max-lookups"]);
if (!Number.isInteger(maxLookups) || maxLookups < 0) throw new Error("--max-lookups must be a whole number");

const started = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);

// Any constant works; it only has to be the same for every sync.
const LOCK_KEY = 7_202_611;
// The web app spaces its own requests 1.1 s apart from the same IP in local dev; 2 s here keeps the
// two together around MusicBrainz's 1 request per second (docs/decisions.md).
const WORKER_MIN_INTERVAL_MS = 2000;

async function main() {
  const sql = connect({ allowRemote: args["allow-remote"] });
  let runId: number | null = null;
  const counts: Record<string, unknown> = {};
  try {
    const [{ locked }] = (await sql`select pg_try_advisory_lock(${LOCK_KEY}) as locked`) as unknown as [{ locked: boolean }];
    if (!locked) throw new Error("Another catalog sync is running.");

    // A run still marked running holds no lock any more, so it was interrupted.
    const stale = await sql`
      update catalog.sync_runs set status = 'failed', finished_at = now(), error = 'interrupted'
      where status = 'running'
    `;
    if (stale.count > 0) log(`Marked ${stale.count} interrupted run(s) as failed.`);

    const lookupsOnly = args["lookups-only"];
    const dumpDate = lookupsOnly ? null : (args.date ?? (args.file ? "local-file" : await latestDumpDate()));
    const [{ id }] = (await sql`
      insert into catalog.sync_runs (dump_date) values (${dumpDate}) returning id::int as id
    `) as unknown as [{ id: number }];
    runId = id;
    log(`Sync run ${runId}: ${dumpDate ? `release-group dump ${dumpDate}` : "lookups only"}`);

    // 1–2. Release groups, then canonical releases.
    const canonicalFolder = dumpDate ? await loadDumps(sql, runId, dumpDate, counts) : null;

    // 3. Vanished albums.
    const mb = createMusicBrainzClient({ minIntervalMs: WORKER_MIN_INTERVAL_MS });
    counts.vanished = await resolveVanished(sql, mb, { max: maxLookups, log });

    await sql`
      update catalog.sync_runs set status = 'succeeded', finished_at = now(), counts = ${sql.json(counts as never)}
      where id = ${runId}
    `;
    log(`Sync run ${runId} succeeded.`);

    if (dumpDate && !args.file && canonicalFolder) await pruneDownloads(CACHE_DIR, { dumpDate, canonicalFolder }, log);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId !== null) {
      await sql`
        update catalog.sync_runs set status = 'failed', finished_at = now(), error = ${message},
          counts = ${sql.json(counts as never)}
        where id = ${runId}
      `.catch(() => {});
    }
    throw err;
  } finally {
    await sql.end();
  }
}

/** Steps 1 and 2. Returns the canonical dump folder used, or null when skipped. */
async function loadDumps(
  sql: ReturnType<typeof connect>,
  runId: number,
  dumpDate: string,
  counts: Record<string, unknown>,
): Promise<string | null> {
  // 1. Release groups.
  const archive = args.file ?? (await ensureReleaseGroupDump(CACHE_DIR, dumpDate, log));
  const { albums, stats } = readReleaseGroups(archive, { log });
  counts.albums = await loadAlbums(sql, albums, log, { vanished: { runId } });
  counts.read = stats;
  await saveCounts(sql, runId, counts);

  // 2. Canonical releases (published twice a month; an unchanged folder changes nothing).
  if (args["skip-canonical"]) return null;
  const canonicalFolder = args["canonical-folder"] ?? (await latestCanonicalDump());
  const canonicalArchive = await ensureCanonicalDump(CACHE_DIR, canonicalFolder, log);
  counts.canonical = await loadCanonical(sql, canonicalArchive, canonicalFolder, log);
  await sql`update catalog.sync_runs set canonical_folder = ${canonicalFolder} where id = ${runId}`;
  await saveCounts(sql, runId, counts);
  return canonicalFolder;
}

async function saveCounts(sql: ReturnType<typeof connect>, runId: number, counts: Record<string, unknown>) {
  await sql`update catalog.sync_runs set counts = ${sql.json(counts as never)} where id = ${runId}`;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
