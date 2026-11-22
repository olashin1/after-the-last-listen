import { describe, expect, it } from "vitest";
import { isIsoDate, localIsoDate, formatListenDate } from "./dates";
import { parseRating, RATINGS, ratingFromStar, ratingLabel, starFill, stepRating } from "./rating";

describe("ratings", () => {
  it("lists the ten half steps", () => {
    expect(RATINGS).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  });

  it("labels ratings", () => {
    expect(ratingLabel(1)).toBe("1 star");
    expect(ratingLabel(3.5)).toBe("3.5 stars");
  });

  it("fills stars for a rating", () => {
    expect([1, 2, 3, 4, 5].map((s) => starFill(3.5, s))).toEqual([1, 1, 1, 0.5, 0]);
    expect([1, 2, 3, 4, 5].map((s) => starFill(null, s))).toEqual([0, 0, 0, 0, 0]);
    expect(starFill(0.5, 1)).toBe(0.5);
  });

  it("maps star halves to ratings", () => {
    expect(ratingFromStar(4, true)).toBe(3.5);
    expect(ratingFromStar(4, false)).toBe(4);
    expect(ratingFromStar(1, true)).toBe(0.5);
  });

  it("steps by half stars within range", () => {
    expect(stepRating(null, 1)).toBe(0.5);
    expect(stepRating(3, 1)).toBe(3.5);
    expect(stepRating(5, 1)).toBe(5);
    expect(stepRating(0.5, -1)).toBe(0.5);
  });

  it("parses only valid ratings", () => {
    expect(parseRating("4.5")).toBe(4.5);
    expect(parseRating(2)).toBe(2);
    expect(parseRating("4.25")).toBeNull();
    expect(parseRating("0")).toBeNull();
    expect(parseRating("")).toBeNull();
    expect(parseRating(null)).toBeNull();
  });
});

describe("dates", () => {
  it("formats the local date as YYYY-MM-DD", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-11-21")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-1-5")).toBe(false);
    expect(isIsoDate(20261121)).toBe(false);
  });

  it("formats a listen date without shifting the day", () => {
    expect(formatListenDate("2026-11-01")).toBe("1 Nov 2026");
  });
});
