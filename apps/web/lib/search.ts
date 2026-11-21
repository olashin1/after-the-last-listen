// Album search for the /search page. Server-only.
// Local search is the Postgres function search_albums() (PRD §7). When its best result is weak or
// there are none (usually a release newer than the last dump), liveFallback() makes one
// rate-limited MusicBrainz search and adds what it finds to the catalog, so the next search is local.
// Validation and the writes themselves are in Postgres (add_live_albums, live_search_due).

import { MusicBrainzBusy, mapReleaseGroupSearch, releaseGroupSearchQuery } from "@atll/musicbrainz";
import type { Database } from "@atll/types";
import { musicbrainz } from "@/lib/musicbrainz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SearchResult = Database["public"]["Functions"]["search_albums"]["Returns"][number];

/**
 * Below this word similarity the best local result probably isn't what the user meant.
 * Chosen from `pnpm search:eval` (docs/decisions.md): below almost every correct top-1 match.
 */
export const WEAK_MATCH = 0.8;
/** How many albums to ask MusicBrainz for. */
const LIVE_LIMIT = 10;
/** Never keep a searcher waiting behind other MusicBrainz requests for longer than this. */
const MAX_QUEUE_WAIT_MS = 2500;

export async function searchAlbums(q: string, lim = 20) {
  const supabase = await createClient();
  const started = performance.now();
  const { data, error } = await supabase.rpc("search_albums", { q, lim });
  const ms = Math.round(performance.now() - started);
  if (error) throw new Error(`search_albums failed: ${error.message}`);
  return { results: data, ms };
}

/** True when local results aren't good enough and MusicBrainz is worth asking. */
export function isWeak(results: SearchResult[]): boolean {
  return results.length === 0 || (results[0]?.match ?? 0) < WEAK_MATCH;
}

/**
 * Ask MusicBrainz once for query `q` and add new albums to the catalog. Returns the albums it added
 * that aren't in `alreadyShown` (album ids), as search results. Returns [] when the query was
 * searched live recently, MusicBrainz is busy or failing, or nothing new turned up; local search is
 * never affected.
 */
export async function liveFallback(q: string, alreadyShown: Set<number>): Promise<SearchResult[]> {
  try {
    const admin = createAdminClient();
    const { data: due, error: dueError } = await admin.rpc("live_search_due", { q });
    if (dueError) throw new Error(`live_search_due failed: ${dueError.message}`);
    if (!due) return [];

    const body = await musicbrainz.get(
      "release-group",
      { query: releaseGroupSearchQuery(q), limit: String(LIVE_LIMIT) },
      // No retries: the searcher is waiting, and the next search for this query tries again.
      { maxQueueWaitMs: MAX_QUEUE_WAIT_MS, retries: 0 },
    );
    const albums = mapReleaseGroupSearch(body);
    const { data: added, error: addError } = await admin.rpc("add_live_albums", { p_query: q, p_albums: albums });
    if (addError) throw new Error(`add_live_albums failed: ${addError.message}`);
    if (!added) return [];

    const found = new Set(albums.map((a) => a.mbid));
    const { results } = await searchAlbums(q, 50);
    return results.filter((r) => found.has(r.mbid) && !alreadyShown.has(r.id));
  } catch (err) {
    if (!(err instanceof MusicBrainzBusy)) {
      console.error(`Live search fallback failed for "${q}":`, err instanceof Error ? err.message : err);
    }
    return [];
  }
}
