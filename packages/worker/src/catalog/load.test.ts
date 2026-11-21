import { describe, expect, it } from "vitest";
import { dumpGuardFailure } from "./load.ts";

describe("dumpGuardFailure", () => {
  it("allows the first import into an empty catalog", () => {
    expect(dumpGuardFailure({ activeBefore: 0, staged: 10, vanished: null })).toBeNull();
  });

  it("allows a normal weekly dump", () => {
    expect(dumpGuardFailure({ activeBefore: 1000, staged: 1005, vanished: 12 })).toBeNull();
  });

  it("aborts when the dump is much smaller than the catalog (truncated download)", () => {
    expect(dumpGuardFailure({ activeBefore: 1000, staged: 900, vanished: null })).toMatch(/under 95%/);
  });

  it("aborts when too many albums vanished", () => {
    expect(dumpGuardFailure({ activeBefore: 1000, staged: 1000, vanished: 21 })).toMatch(/over 2%/);
    expect(dumpGuardFailure({ activeBefore: 1000, staged: 1000, vanished: 20 })).toBeNull();
  });

  it("uses the given thresholds", () => {
    expect(dumpGuardFailure({ activeBefore: 1000, staged: 900, vanished: null }, { minDumpShare: 0.8 })).toBeNull();
  });
});
