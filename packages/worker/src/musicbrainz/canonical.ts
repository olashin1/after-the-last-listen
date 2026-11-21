// MusicBrainz canonical release mapping (CC0, updated on the 1st and 15th of each month):
// canonical/canonical_release_redirect.csv in the canonical data dump, one row per release:
//   release_mbid,canonical_release_mbid,release_group_mbid
// Every release of a release group points to the same canonical release.

export const CANONICAL_RELEASE_MEMBER = (folder: string) => `${folder}/canonical/canonical_release_redirect.csv`;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ROW_RE = new RegExp(`^(${UUID}),(${UUID}),(${UUID})$`, "i");

export type CanonicalRow = { releaseGroupMbid: string; canonicalReleaseMbid: string };

/** Parse one CSV line. Returns null for the header and for malformed lines. */
export function parseCanonicalReleaseLine(line: string): CanonicalRow | null {
  const m = ROW_RE.exec(line.trim());
  if (!m) return null;
  return { canonicalReleaseMbid: m[2]!.toLowerCase(), releaseGroupMbid: m[3]!.toLowerCase() };
}
