// Live search fallback (PRD §7): one MusicBrainz release-group search when local search is weak,
// usually for a release newer than the last dump. Results go into the catalog (add_live_albums), so
// the next search finds them locally. Pure helpers, so they're unit-tested.
//
// API (https://musicbrainz.org/doc/MusicBrainz_API/Search, checked 2026-11-21):
//   GET /ws/2/release-group?query=<Lucene>&limit=<1-100>&fmt=json
// Each result has id, score, title, primary-type, secondary-types, first-release-date,
// artist-credit and releases [{id, status}].

import { mapReleaseGroup } from "./release-group.ts";

/** Album rows in the shape public.add_live_albums() takes. */
export type LiveAlbum = {
  mbid: string;
  title: string;
  artist_credit: string;
  primary_type: string;
  secondary_types: string[];
  first_release_date: string | null;
  canonical_release_mbid: string | null;
  credits: { artist_mbid: string; name: string; sort_name: string; disambiguation: string | null; position: number }[];
};

// Lucene special characters (and the words AND/OR/NOT) would change the query's meaning.
const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;

export function escapeLucene(text: string): string {
  return text
    .replace(LUCENE_SPECIAL, (c) => "\\" + c)
    .replace(/\b(AND|OR|NOT)\b/g, (w) => w.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();
}

/** Query string for the search: the user's words against the default fields, albums and EPs only. */
export function releaseGroupSearchQuery(q: string): string {
  return `(${escapeLucene(q)}) AND (primarytype:album OR primarytype:ep)`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Map a search response to catalog rows: Albums and EPs only, mapped like the dump (no genres,
 * tags or ratings). The provisional canonical release is the first official release listed, or the
 * first release; the next canonical dump replaces it.
 */
export function mapReleaseGroupSearch(body: unknown): LiveAlbum[] {
  const groups = (body as { "release-groups"?: unknown })?.["release-groups"];
  if (!Array.isArray(groups)) return [];

  const albums: LiveAlbum[] = [];
  for (const rg of groups as Record<string, unknown>[]) {
    const result = mapReleaseGroup(rg as Parameters<typeof mapReleaseGroup>[0]);
    if (!("kept" in result)) continue;
    const a = result.kept;

    const releases = Array.isArray(rg?.releases) ? (rg.releases as { id?: unknown; status?: unknown }[]) : [];
    const valid = releases.filter((r) => typeof r?.id === "string" && UUID_RE.test(r.id));
    const canonical = valid.find((r) => r.status === "Official") ?? valid[0];

    albums.push({
      mbid: a.mbid,
      title: a.title,
      artist_credit: a.artistCredit,
      primary_type: a.primaryType,
      secondary_types: a.secondaryTypes,
      first_release_date: a.firstReleaseDate,
      canonical_release_mbid: canonical ? (canonical.id as string).toLowerCase() : null,
      credits: a.credits.map((c) => ({
        artist_mbid: c.artistMbid,
        name: c.name,
        sort_name: c.sortName,
        disambiguation: c.disambiguation,
        position: c.position,
      })),
    });
  }
  return albums;
}
