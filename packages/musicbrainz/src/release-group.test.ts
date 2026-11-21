import { describe, expect, it } from "vitest";
import { mapReleaseGroup } from "./release-group.ts";

// Shaped like real dump lines (2026-11-18 dump), trimmed. NC-licensed fields left in on purpose
// to check they're ignored.
const geneHarris = {
  aliases: [],
  "secondary-type-ids": [],
  relations: [],
  "first-release-date": "1994-07-31",
  "primary-type": "Album",
  genres: [{ id: "a715278f-1580-409f-8078-4ffbc800e08b", name: "jazz", count: 1, disambiguation: "" }],
  disambiguation: "",
  "artist-credit": [
    {
      joinphrase: "",
      name: "The Gene Harris Quartet",
      artist: {
        "sort-name": "Harris, Gene Quartet, The",
        type: "Group",
        id: "f99c1134-b48e-4659-8128-712264f02431",
        name: "The Gene Harris Quartet",
        disambiguation: "",
        tags: [{ count: 1, name: "jazz" }],
      },
    },
  ],
  id: "725cb26a-f4a2-3dc7-8c1e-94f2dca62c8c",
  rating: { "votes-count": 0, value: null },
  annotation: null,
  title: "'Funky Gene's'",
  tags: [{ count: 1, name: "jazz" }],
  "secondary-types": [],
};

const watchTheThrone = {
  id: "00000000-0000-0000-0000-0000000000f1",
  title: " Watch the Throne ",
  "primary-type": "Album",
  "secondary-types": ["Live"],
  "first-release-date": "2011-08",
  "artist-credit": [
    { name: "JAY‐Z", joinphrase: " & ", artist: { id: "00000000-0000-0000-0000-0000000000e1", name: "JAY‐Z", "sort-name": "JAY‐Z", disambiguation: "US rapper" } },
    { name: "Kanye West", joinphrase: "", artist: { id: "00000000-0000-0000-0000-0000000000e2", name: "Kanye West", "sort-name": "West, Kanye" } },
  ],
  relations: [
    { "target-type": "url", type: "wikidata" },
    { "target-type": "url", type: "discogs" },
    { "target-type": "release_group", type: "included in" },
  ],
};

describe("mapReleaseGroup", () => {
  it("maps a real-shaped album", () => {
    const result = mapReleaseGroup(geneHarris);
    expect(result).toEqual({
      kept: {
        mbid: "725cb26a-f4a2-3dc7-8c1e-94f2dca62c8c",
        title: "'Funky Gene's'",
        artistCredit: "The Gene Harris Quartet",
        primaryType: "Album",
        secondaryTypes: [],
        firstReleaseDate: "1994-07-31",
        linkCount: 0,
        credits: [
          {
            artistMbid: "f99c1134-b48e-4659-8128-712264f02431",
            name: "The Gene Harris Quartet",
            sortName: "Harris, Gene Quartet, The",
            disambiguation: null,
            position: 0,
          },
        ],
        badDate: false,
      },
    });
  });

  it("never carries genres, tags, ratings or annotations", () => {
    const json = JSON.stringify(mapReleaseGroup(geneHarris));
    for (const field of ["genres", "tags", "rating", "annotation", "jazz"]) expect(json).not.toContain(field);
  });

  it("builds the display credit from names and join phrases, and keeps credit order", () => {
    const result = mapReleaseGroup(watchTheThrone);
    if (!("kept" in result)) throw new Error("expected kept");
    expect(result.kept.title).toBe("Watch the Throne");
    expect(result.kept.artistCredit).toBe("JAY‐Z & Kanye West");
    expect(result.kept.credits.map((c) => [c.name, c.position, c.disambiguation])).toEqual([
      ["JAY‐Z", 0, "US rapper"],
      ["Kanye West", 1, null],
    ]);
    expect(result.kept.secondaryTypes).toEqual(["Live"]);
    expect(result.kept.firstReleaseDate).toBe("2011-08");
  });

  it("counts only URL relationships as links", () => {
    const result = mapReleaseGroup(watchTheThrone);
    expect("kept" in result && result.kept.linkCount).toBe(2);
  });

  it("keeps EPs and skips other primary types", () => {
    expect("kept" in mapReleaseGroup({ ...geneHarris, "primary-type": "EP" })).toBe(true);
    expect(mapReleaseGroup({ ...geneHarris, "primary-type": "Single" })).toEqual({ skipped: "not_album_or_ep" });
    expect(mapReleaseGroup({ ...geneHarris, "primary-type": null })).toEqual({ skipped: "not_album_or_ep" });
  });

  it("skips blank titles and bad ids", () => {
    expect(mapReleaseGroup({ ...geneHarris, title: "  " })).toEqual({ skipped: "blank_title" });
    expect(mapReleaseGroup({ ...geneHarris, id: "nope" })).toEqual({ skipped: "missing_id" });
  });

  it("keeps an album with an empty or malformed date, with a NULL date", () => {
    const empty = mapReleaseGroup({ ...geneHarris, "first-release-date": "" });
    expect("kept" in empty && [empty.kept.firstReleaseDate, empty.kept.badDate]).toEqual([null, false]);
    const bad = mapReleaseGroup({ ...geneHarris, "first-release-date": "1994-7" });
    expect("kept" in bad && [bad.kept.firstReleaseDate, bad.kept.badDate]).toEqual([null, true]);
  });

  it("credits an artist once even if they appear twice", () => {
    const twice = {
      ...watchTheThrone,
      "artist-credit": [watchTheThrone["artist-credit"][0], watchTheThrone["artist-credit"][1], watchTheThrone["artist-credit"][0]],
    };
    const result = mapReleaseGroup(twice);
    expect("kept" in result && result.kept.credits.map((c) => c.position)).toEqual([0, 1]);
  });

  it("handles a missing artist credit", () => {
    const result = mapReleaseGroup({ ...geneHarris, "artist-credit": undefined });
    expect("kept" in result && [result.kept.artistCredit, result.kept.credits]).toEqual(["", []]);
  });
});
