// Map a MusicBrainz release group (a line of the JSON dump, or an API result) to the slim catalog shape.
// Also maps release groups in API search results (live search fallback). Pure, so it is unit-tested.
//
// License: MusicBrainz core data is CC0, but annotation, genres, ratings and tags are
// CC BY-NC-SA. We never read or store those fields (docs/decisions.md, 2026-11-20).

export const KEPT_PRIMARY_TYPES = ["Album", "EP"] as const;
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export type MappedCredit = {
  artistMbid: string;
  name: string;
  sortName: string;
  disambiguation: string | null;
  position: number;
};

export type MappedAlbum = {
  mbid: string;
  title: string;
  artistCredit: string;
  primaryType: (typeof KEPT_PRIMARY_TYPES)[number];
  secondaryTypes: string[];
  firstReleaseDate: string | null;
  /** Number of URL relationships (Wikidata, AllMusic, Discogs, reviews…): Phase 1 popularity proxy. */
  linkCount: number;
  credits: MappedCredit[];
  /** True when the dump had a non-empty date we couldn't use. The album is still kept, with a NULL date. */
  badDate: boolean;
};

export type SkipReason = "not_album_or_ep" | "blank_title" | "missing_id";
export type MapResult = { kept: MappedAlbum } | { skipped: SkipReason };

// Only the fields we read. Everything else in the line is ignored.
type DumpArtistCredit = {
  name?: unknown;
  joinphrase?: unknown;
  artist?: { id?: unknown; name?: unknown; "sort-name"?: unknown; disambiguation?: unknown };
};
type DumpReleaseGroup = {
  id?: unknown;
  title?: unknown;
  "primary-type"?: unknown;
  "secondary-types"?: unknown;
  "first-release-date"?: unknown;
  "artist-credit"?: unknown;
  relations?: unknown;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mapReleaseGroup(rg: DumpReleaseGroup): MapResult {
  const mbid = str(rg.id);
  if (!UUID_RE.test(mbid)) return { skipped: "missing_id" };

  const primaryType = str(rg["primary-type"]);
  if (!(KEPT_PRIMARY_TYPES as readonly string[]).includes(primaryType)) return { skipped: "not_album_or_ep" };

  const title = str(rg.title);
  if (title.trim() === "") return { skipped: "blank_title" };

  const rawCredits = Array.isArray(rg["artist-credit"]) ? (rg["artist-credit"] as DumpArtistCredit[]) : [];
  // Display credit exactly as MusicBrainz shows it: each credited name followed by its join phrase.
  const artistCredit = rawCredits.map((c) => str(c.name) + str(c.joinphrase)).join("").trim();

  // One row per artist per album (the table's primary key). If an artist is credited twice,
  // keep their first position; positions stay unique even with a gap.
  const credits: MappedCredit[] = [];
  const seen = new Set<string>();
  rawCredits.forEach((c, position) => {
    const artistMbid = str(c.artist?.id);
    if (!UUID_RE.test(artistMbid) || seen.has(artistMbid)) return;
    seen.add(artistMbid);
    const name = str(c.artist?.name).trim() || str(c.name).trim();
    if (!name) return;
    credits.push({
      artistMbid,
      name,
      sortName: str(c.artist?.["sort-name"]).trim() || name,
      disambiguation: str(c.artist?.disambiguation).trim() || null,
      position,
    });
  });

  const rawDate = str(rg["first-release-date"]);
  const dateOk = DATE_RE.test(rawDate);

  const secondaryTypes = Array.isArray(rg["secondary-types"])
    ? (rg["secondary-types"] as unknown[]).filter((t): t is string => typeof t === "string" && t !== "")
    : [];

  const linkCount = Array.isArray(rg.relations)
    ? (rg.relations as { "target-type"?: unknown }[]).filter((r) => r?.["target-type"] === "url").length
    : 0;

  return {
    kept: {
      mbid: mbid.toLowerCase(),
      title: title.trim(),
      artistCredit,
      primaryType: primaryType as MappedAlbum["primaryType"],
      secondaryTypes,
      firstReleaseDate: dateOk ? rawDate : null,
      linkCount,
      credits,
      badDate: rawDate !== "" && !dateOk,
    },
  };
}
