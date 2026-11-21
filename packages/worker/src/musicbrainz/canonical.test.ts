import { describe, expect, it } from "vitest";
import { CANONICAL_RELEASE_MEMBER, parseCanonicalReleaseLine } from "./canonical.ts";

describe("parseCanonicalReleaseLine", () => {
  it("reads the canonical release and release group from a real-shaped row", () => {
    expect(
      parseCanonicalReleaseLine(
        "96ccdd6e-ef20-32b2-ac99-8840c1a191c1,3a25785e-50ec-383c-89cf-fd512181449c,8b6f133a-2fdf-3cc2-b84d-1c889adc0939",
      ),
    ).toEqual({
      canonicalReleaseMbid: "3a25785e-50ec-383c-89cf-fd512181449c",
      releaseGroupMbid: "8b6f133a-2fdf-3cc2-b84d-1c889adc0939",
    });
  });

  it("skips the header and malformed lines", () => {
    expect(parseCanonicalReleaseLine("release_mbid,canonical_release_mbid,release_group_mbid")).toBeNull();
    expect(parseCanonicalReleaseLine("a,b,c")).toBeNull();
    expect(parseCanonicalReleaseLine("")).toBeNull();
  });

  it("lowercases MBIDs and tolerates a trailing carriage return", () => {
    expect(
      parseCanonicalReleaseLine(
        "B3577744-E721-4357-BC60-D79C02863DAC,B3577744-E721-4357-BC60-D79C02863DAC,E8BEE759-9EFC-35C2-93D7-09ACE9123467\r",
      ),
    ).toEqual({
      canonicalReleaseMbid: "b3577744-e721-4357-bc60-d79c02863dac",
      releaseGroupMbid: "e8bee759-9efc-35c2-93d7-09ace9123467",
    });
  });
});

describe("CANONICAL_RELEASE_MEMBER", () => {
  it("points inside the dated dump folder", () => {
    expect(CANONICAL_RELEASE_MEMBER("musicbrainz-canonical-dump-20261117-080003")).toBe(
      "musicbrainz-canonical-dump-20261117-080003/canonical/canonical_release_redirect.csv",
    );
  });
});
