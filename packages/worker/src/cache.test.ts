import { describe, expect, it } from "vitest";
import { prunable } from "./cache.ts";

describe("prunable", () => {
  it("lists matching names except the one to keep, and leaves anything else alone", () => {
    expect(prunable(["20261118-001001", "20261121-001001", "canonical", "notes.txt"], /^\d{8}-\d{6}$/, "20261121-001001")).toEqual([
      "20261118-001001",
    ]);
  });
});
