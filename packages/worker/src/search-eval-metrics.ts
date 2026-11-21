// Metrics for the search eval. Pure, so they're unit-tested.

export type EvalCase = {
  query: string;
  /** Readable "Title — Artist", for humans. */
  expected: string;
  expected_mbid: string | null;
  category: string;
  author: string;
  note?: string;
};

export type EvalResult = {
  case: EvalCase;
  /** 1-based position of the expected album in the results, or null if it wasn't returned. */
  rank: number | null;
  ms: number;
  top: { mbid: string; title: string; artist_credit: string; primary_type: string; secondary_types: string[]; score: number; match: number }[];
};

type Group = { total: number; top1: number };

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

export function summarize(results: EvalResult[]) {
  const total = results.length;
  const hits = (n: number) => results.filter((r) => r.rank !== null && r.rank <= n).length;
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);

  const group = (key: (r: EvalResult) => string) => {
    const out: Record<string, Group> = {};
    for (const r of results) {
      const g = (out[key(r)] ??= { total: 0, top1: 0 });
      g.total++;
      if (r.rank === 1) g.top1++;
    }
    for (const g of Object.values(out)) g.top1 = g.total ? g.top1 / g.total : 0;
    return out;
  };

  return {
    total,
    top1: total ? hits(1) / total : 0,
    top5: total ? hits(5) / total : 0,
    mrr: total ? results.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / total : 0,
    notFound: results.filter((r) => r.rank === null).length,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    max: ms.at(-1) ?? 0,
    byAuthor: group((r) => r.case.author),
    byCategory: group((r) => r.case.category),
  };
}
