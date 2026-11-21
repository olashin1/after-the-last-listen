import { describe, expect, it } from "vitest";
import { percentile, summarize, type EvalResult } from "./search-eval-metrics.ts";

const result = (rank: number | null, ms: number, author: "user" | "claude" = "claude", category = "exact"): EvalResult => ({
  case: { query: "q", expected: "e", expected_mbid: "m", category, author },
  rank,
  ms,
  top: [],
});

describe("percentile", () => {
  it("uses the nearest-rank method", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("summarize", () => {
  it("computes top-1, top-5, MRR and misses", () => {
    const s = summarize([result(1, 10), result(2, 20), result(6, 30), result(null, 40)]);
    expect(s.total).toBe(4);
    expect(s.top1).toBe(0.25);
    expect(s.top5).toBe(0.5);
    expect(s.mrr).toBeCloseTo((1 + 0.5 + 1 / 6) / 4);
    expect(s.notFound).toBe(1);
    expect(s.max).toBe(40);
  });

  it("splits top-1 by author and category", () => {
    const s = summarize([result(1, 1, "user", "typo"), result(3, 1, "user", "exact"), result(1, 1, "claude", "typo")]);
    expect(s.byAuthor).toEqual({ user: { total: 2, top1: 0.5 }, claude: { total: 1, top1: 1 } });
    expect(s.byCategory.typo).toEqual({ total: 2, top1: 1 });
  });

  it("handles an empty run", () => {
    expect(summarize([])).toMatchObject({ total: 0, top1: 0, top5: 0, mrr: 0 });
  });
});
