import { describe, expect, it } from "vitest";
import { formatDuration, mapReleaseTracks } from "./tracks.ts";

const rec = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Shaped like GET /ws/2/release/<mbid>?inc=recordings&fmt=json, trimmed.
const release = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Double Album",
  media: [
    {
      position: 1,
      format: "CD",
      tracks: [
        { position: 2, number: "2", title: "Second", length: 200400, recording: { id: rec(2), title: "Second (recording)", length: 1 } },
        { position: 1, number: "1", title: "First", length: null, recording: { id: rec(1), title: "First", length: 185000 } },
      ],
    },
    {
      position: 2,
      format: "CD",
      tracks: [{ position: 1, number: "1", title: "", length: 61000, recording: { id: rec(3), title: "Disc Two Opener" } }],
    },
  ],
};

describe("mapReleaseTracks", () => {
  it("orders by disc then position, with the first track at the top", () => {
    expect(mapReleaseTracks(release).map((t) => [t.disc_number, t.position, t.title])).toEqual([
      [1, 1, "First"],
      [1, 2, "Second"],
      [2, 1, "Disc Two Opener"],
    ]);
  });

  it("prefers the release's track title and length, falling back to the recording's", () => {
    const [first, second, third] = mapReleaseTracks(release);
    expect(first).toMatchObject({ recording_mbid: rec(1), length_ms: 185000 });
    expect(second).toMatchObject({ title: "Second", length_ms: 200400 });
    expect(third).toMatchObject({ title: "Disc Two Opener", length_ms: 61000 });
  });

  it("skips tracks without a valid recording MBID or any title", () => {
    const tracks = mapReleaseTracks({
      media: [{ position: 1, tracks: [{ position: 1, title: "No recording" }, { position: 2, title: "", recording: { id: rec(9) } }, { position: 3, title: "Ok", recording: { id: rec(4) } }] }],
    });
    expect(tracks.map((t) => t.title)).toEqual(["Ok"]);
  });

  it("falls back to list order when positions are missing", () => {
    const tracks = mapReleaseTracks({ media: [{ tracks: [{ title: "A", recording: { id: rec(1) } }, { title: "B", recording: { id: rec(2) } }] }] });
    expect(tracks.map((t) => [t.disc_number, t.position])).toEqual([
      [1, 1],
      [1, 2],
    ]);
  });

  it("keeps the first of two tracks in the same position", () => {
    const tracks = mapReleaseTracks({
      media: [{ position: 1, tracks: [{ position: 1, title: "A", recording: { id: rec(1) } }, { position: 1, title: "B", recording: { id: rec(2) } }] }],
    });
    expect(tracks.map((t) => t.title)).toEqual(["A"]);
  });

  it("returns nothing for a release without media", () => {
    expect(mapReleaseTracks({})).toEqual([]);
    expect(mapReleaseTracks(null)).toEqual([]);
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds", () => expect(formatDuration(185000)).toBe("3:05"));
  it("rounds to the nearest second", () => expect(formatDuration(59600)).toBe("1:00"));
  it("adds hours when needed", () => expect(formatDuration(3723000)).toBe("1:02:03"));
  it("is empty when unknown", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(-5)).toBe("");
  });
});
