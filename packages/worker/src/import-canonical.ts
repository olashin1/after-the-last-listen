// Load MusicBrainz's canonical release mapping into catalog.albums.canonical_release_mbid.
// The weekly sync (`pnpm catalog:sync`) runs this too.
//
//   pnpm catalog:canonical                  download (or reuse) the latest canonical dump and load it
//   pnpm catalog:canonical --folder <name>  a specific dump, e.g. musicbrainz-canonical-dump-20261117-080003
//
// Run after `pnpm catalog:import`.

import { parseArgs } from "node:util";
import { loadCanonical } from "./catalog/canonical.ts";
import { connect } from "./db.ts";
import { ensureCanonicalDump, latestCanonicalDump } from "./musicbrainz/dump.ts";
import { CACHE_DIR } from "./paths.ts";

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
  try {
    await loadCanonical(sql, archive, folder, log);
    log("Committed.");
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
