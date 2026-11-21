import { describe, expect, it } from "vitest";
import { escapeLucene, mapReleaseGroupSearch, releaseGroupSearchQuery } from "./search.ts";

const id = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("escapeLucene", () => {
  it("escapes special characters and neutralises operators", () => {
    expect(escapeLucene('AC/DC: "back in black" (live)')).toBe(String.raw`AC\/DC\: \"back in black\" \(live\)`);
    expect(escapeLucene(String.raw`a\b`)).toBe(String.raw`a\\b`);
    expect(escapeLucene("rock AND roll OR NOT")).toBe("rock and roll or not");
    expect(escapeLucene("  a   b ")).toBe("a b");
  });

  it("builds an albums-and-EPs query", () => {
    expect(releaseGroupSearchQuery("kid a")).toBe("(kid a) AND (primarytype:album OR primarytype:ep)");
  });
});

// Shaped like GET /ws/2/release-group?query=…&fmt=json, trimmed.
const response = {
  created: "2026-11-21T00:00:00.000Z",
  count: 3,
  "release-groups": [
    {
      id: id(1).toUpperCase(),
      score: 100,
      title: "Brand New Record",
      "primary-type": "Album",
      "secondary-types": ["Live"],
      "first-release-date": "2026-11-20",
      "artist-credit": [
        { name: "Wobble", joinphrase: " & ", artist: { id: id(11), name: "Wobble", "sort-name": "Wobble" } },
        { name: "Sprocket", artist: { id: id(12), name: "Sprocket", "sort-name": "Sprocket", disambiguation: "band" } },
      ],
      releases: [
        { id: id(21), status: "Bootleg" },
        { id: id(22), status: "Official" },
      ],
      tags: [{ name: "should-not-be-stored", count: 1 }],
    },
    { id: id(2), title: "A Single", "primary-type": "Single", "artist-credit": [], releases: [] },
    { id: id(3), title: "No Releases EP", "primary-type": "EP", "artist-credit": [], "first-release-date": "" },
  ],
};

describe("mapReleaseGroupSearch", () => {
  it("maps albums and EPs, skipping other types", () => {
    const albums = mapReleaseGroupSearch(response);
    expect(albums.map((a) => a.mbid)).toEqual([id(1), id(3)]);
  });

  it("maps the credit, types, date and the first official release", () => {
    const [album] = mapReleaseGroupSearch(response);
    expect(album).toEqual({
      mbid: id(1),
      title: "Brand New Record",
      artist_credit: "Wobble & Sprocket",
      primary_type: "Album",
      secondary_types: ["Live"],
      first_release_date: "2026-11-20",
      canonical_release_mbid: id(22),
      credits: [
        { artist_mbid: id(11), name: "Wobble", sort_name: "Wobble", disambiguation: null, position: 0 },
        { artist_mbid: id(12), name: "Sprocket", sort_name: "Sprocket", disambiguation: "band", position: 1 },
      ],
    });
    expect(JSON.stringify(album)).not.toContain("should-not-be-stored");
  });

  it("leaves the canonical release empty when there are no releases, and handles junk", () => {
    expect(mapReleaseGroupSearch(response)[1]!.canonical_release_mbid).toBeNull();
    expect(mapReleaseGroupSearch(null)).toEqual([]);
    expect(mapReleaseGroupSearch({ "release-groups": "nope" })).toEqual([]);
  });
});
