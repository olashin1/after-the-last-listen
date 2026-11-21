// Search accuracy eval for the Phase 1 spike (PRD §12: correct album first for ≥ 90% of test searches).
//
//   pnpm search:eval                          run search-eval/queries.json through public.search_albums
//   pnpm search:eval --weights 1,0.3,0.1,0.1  try other weights (similarity,popularity,type[,full similarity]) via the core
//   pnpm search:eval --threshold 0.25         try another word-similarity threshold (needs --weights)
//   pnpm search:eval --verbose                print the top 5 for every query, not only misses
//
// Entries with an empty query or no expected_mbid are reported as unfilled and skipped.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { connect } from "./db.ts";
import { summarize, type EvalCase, type EvalResult } from "./search-eval-metrics.ts";

const QUERIES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../search-eval/queries.json");

const { values: args } = parseArgs({
  options: {
    weights: { type: "string" },
    threshold: { type: "string" },
    verbose: { type: "boolean", default: false },
    // Live search fallback threshold to report on (apps/web/lib/search.ts WEAK_MATCH).
    weak: { type: "string", default: "0.8" },
    "allow-remote": { type: "boolean", default: false },
  },
});

type Row = { mbid: string; title: string; artist_credit: string; primary_type: string; secondary_types: string[]; score: number; match: number };

async function main() {
  const cases = JSON.parse(await readFile(QUERIES, "utf8")) as EvalCase[];
  const ready = cases.filter((c) => c.query.trim() && c.expected_mbid);
  const unfilled = cases.length - ready.length;

  const weights = args.weights?.split(",").map(Number);
  if (weights && (![3, 4].includes(weights.length) || weights.some((w) => !Number.isFinite(w)))) {
    throw new Error("--weights needs three or four numbers: similarity,popularity,type[,full]");
  }
  if (args.threshold && !weights) throw new Error("--threshold needs --weights (it uses the tunable core)");
  const threshold = args.threshold ? Number(args.threshold) : 0.5;

  const sql = connect({ allowRemote: args["allow-remote"] });
  const results: EvalResult[] = [];
  try {
    // Warm-up so the first timing isn't a cold cache.
    await sql`select * from public.search_albums('warm up', 5)`;

    for (const c of ready) {
      const t0 = performance.now();
      const rows: Row[] = weights
        ? await sql`select * from catalog.search_albums_weighted(${c.query}, 50, ${weights[0]!}, ${weights[1]!}, ${weights[2]!}, ${threshold}, ${weights[3] ?? 0})`
        : await sql`select * from public.search_albums(${c.query}, 50)`;
      const ms = performance.now() - t0;
      const index = rows.findIndex((r) => r.mbid === c.expected_mbid);
      results.push({ case: c, rank: index === -1 ? null : index + 1, ms, top: rows.slice(0, 5) });
    }
  } finally {
    await sql.end();
  }

  const s = summarize(results);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const label = weights ? `weights ${weights.join("/")}, threshold ${threshold}` : "public.search_albums (default weights)";

  console.log(`\nSearch eval: ${label}`);
  console.log(`Queries: ${s.total} run, ${unfilled} unfilled`);
  console.log(`Top-1: ${pct(s.top1)}   Top-5: ${pct(s.top5)}   MRR: ${s.mrr.toFixed(3)}   Not found: ${s.notFound}`);
  console.log(`Latency: p50 ${s.p50.toFixed(0)} ms, p95 ${s.p95.toFixed(0)} ms, max ${s.max.toFixed(0)} ms`);
  for (const [author, a] of Object.entries(s.byAuthor)) console.log(`  ${author}: top-1 ${pct(a.top1)} of ${a.total}`);
  for (const [category, a] of Object.entries(s.byCategory)) console.log(`  [${category}] top-1 ${pct(a.top1)} of ${a.total}`);

  // Live search fallback (apps/web/lib/search.ts): a top result whose match is under the weak
  // threshold triggers a MusicBrainz search. Correct top-1 results should almost never be "weak".
  const weak = Number(args.weak);
  const okMatches = results.filter((r) => r.rank === 1).map((r) => r.top[0]!.match).sort((a, b) => a - b);
  const fallbacks = results.filter((r) => r.top.length === 0 || r.top[0]!.match < weak);
  console.log(
    `Fallback at match < ${weak}: ${fallbacks.length} of ${results.length} queries would ask MusicBrainz ` +
      `(${fallbacks.filter((r) => r.rank === 1).length} of them already correct). ` +
      `Correct top-1 match: min ${okMatches[0]?.toFixed(2) ?? "-"}, p10 ${okMatches[Math.floor(okMatches.length * 0.1)]?.toFixed(2) ?? "-"}`,
  );

  for (const r of results) {
    if (r.rank === 1 && !args.verbose) continue;
    console.log(`\n${r.rank === 1 ? "OK  " : "MISS"} "${r.case.query}" → want ${r.case.expected} (rank ${r.rank ?? "not found"}, ${r.ms.toFixed(0)} ms)`);
    r.top.forEach((t, i) => {
      const flag = t.mbid === r.case.expected_mbid ? " ←" : "";
      const types = [t.primary_type, ...t.secondary_types].join("+");
      console.log(`     ${i + 1}. ${t.title} — ${t.artist_credit} [${types}] ${t.score.toFixed(3)} (match ${t.match.toFixed(2)})${flag}`);
    });
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
