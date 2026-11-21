// Prune old MusicBrainz downloads after a successful sync, keeping the ones just used. Each dump is
// 1–2.5 GB, so weekly downloads would otherwise pile up in .cache/musicbrainz.

import { readdir, rm } from "node:fs/promises";
import path from "node:path";

/** Names matching `pattern` other than `keep` (all of them sort as dates, so this is "older or newer"). */
export function prunable(names: string[], pattern: RegExp, keep: string): string[] {
  return names.filter((n) => pattern.test(n) && n !== keep);
}

const DUMP_DIR_RE = /^\d{8}-\d{6}$/;
const CANONICAL_FILE_RE = /^musicbrainz-canonical-dump-\d{8}-\d{6}\.tar\.zst(\.part)?$/;

export async function pruneDownloads(
  cacheDir: string,
  { dumpDate, canonicalFolder }: { dumpDate: string; canonicalFolder: string },
  log: (msg: string) => void,
): Promise<void> {
  const remove = async (dir: string, names: string[]) => {
    for (const name of names) {
      await rm(path.join(dir, name), { recursive: true, force: true });
      log(`Pruned ${path.join(dir, name)}`);
    }
  };
  const top = await readdir(cacheDir).catch(() => [] as string[]);
  await remove(cacheDir, prunable(top, DUMP_DIR_RE, dumpDate));
  const canonicalDir = path.join(cacheDir, "canonical");
  const canonical = await readdir(canonicalDir).catch(() => [] as string[]);
  await remove(canonicalDir, prunable(canonical, CANONICAL_FILE_RE, `${canonicalFolder}.tar.zst`));
}
