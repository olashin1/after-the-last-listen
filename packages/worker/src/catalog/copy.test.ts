import { describe, expect, it } from "vitest";
import { copyRow, copyValue } from "./copy.ts";

describe("copyValue", () => {
  it("writes NULL as \\N", () => expect(copyValue(null)).toBe("\\N"));
  it("writes numbers as-is", () => expect(copyValue(13)).toBe("13"));
  it("escapes backslash, tab, newline and carriage return", () => {
    expect(copyValue("a\\b\tc\nd\re")).toBe("a\\\\b\\tc\\nd\\re");
  });
  it("leaves other text alone, including quotes and unicode", () => {
    expect(copyValue(`'Funky Gene's' "live" – Björk`)).toBe(`'Funky Gene's' "live" – Björk`);
  });
  it("escapes a literal \\N so it isn't read as NULL", () => expect(copyValue("\\N")).toBe("\\\\N"));
});

describe("copyRow", () => {
  it("joins with tabs and ends with a newline", () => {
    expect(copyRow(["x", null, 2])).toBe("x\t\\N\t2\n");
  });
});
