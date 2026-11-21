// Read the release-group dump as mapped albums, counting what was kept and skipped.
// Shared by `pnpm catalog:import` and `pnpm catalog:sync`.

import { releaseGroupLines } from "./dump.ts";
import { type MappedAlbum, mapReleaseGroup, type SkipReason } from "./map.ts";

export type ReadStats = {
  lines: number;
  kept: number;
  badDates: number;
  parseErrors: number;
  credits: number;
  skipped: Record<SkipReason, number>;
};

/** `albums` yields each kept album; `stats` fills in as it's consumed. Stops after `limit` kept albums. */
export function readReleaseGroups(
  archive: string,
  { limit = Infinity, log }: { limit?: number; log: (msg: string) => void },
): { albums: AsyncGenerator<MappedAlbum>; stats: ReadStats } {
  const stats: ReadStats = {
    lines: 0,
    kept: 0,
    badDates: 0,
    parseErrors: 0,
    credits: 0,
    skipped: { not_album_or_ep: 0, blank_title: 0, missing_id: 0 },
  };

  async function* albums(): AsyncGenerator<MappedAlbum> {
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

  return { albums: albums(), stats };
}
