import { describe, expect, it } from "vitest";
import { classifyLookup } from "./lookup.ts";

const OLD = "aaaaaaaa-0000-4000-8000-000000000001";
const NEW = "aaaaaaaa-0000-4000-8000-000000000002";

describe("classifyLookup", () => {
  it("retires an album MusicBrainz no longer has", () => {
    expect(classifyLookup(OLD, { found: false })).toEqual({ action: "retire", reason: "deleted" });
  });

  it("redirects when the lookup answers with another release group (a merge)", () => {
    expect(classifyLookup(OLD, { found: true, body: { id: NEW.toUpperCase(), "primary-type": "Album" } })).toEqual({
      action: "redirect",
      newMbid: NEW,
    });
  });

  it("retires an album whose type is no longer Album or EP", () => {
    expect(classifyLookup(OLD, { found: true, body: { id: OLD, "primary-type": "Single" } })).toEqual({
      action: "retire",
      reason: "not_album",
    });
    expect(classifyLookup(OLD, { found: true, body: { id: OLD, "primary-type": null } })).toEqual({
      action: "retire",
      reason: "not_album",
    });
  });

  it("keeps an album that is still there (the dump was behind)", () => {
    expect(classifyLookup(OLD, { found: true, body: { id: OLD, "primary-type": "EP" } })).toEqual({ action: "keep" });
  });

  it("refuses a response without a valid id rather than guessing", () => {
    expect(() => classifyLookup(OLD, { found: true, body: { title: "x" } })).toThrow(/no valid id/);
  });
});
