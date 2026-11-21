# Search spike (Phase 1)

Goal (PRD §12): the correct album ranks first for ≥ 90% of 50 real test searches, or the spike recommends a secondary search source.

## Setup

- **Catalog:** MusicBrainz JSON dump `20261118-001001`, `release-group.tar.xz`. 4,652,786 release groups read; **2,967,197 Album/EP kept**, 868,296 artists, 3.41M credits. 455,167 albums have at least one URL link (max 103). `catalog.albums` is 1.3 GB with indexes.
- **Import time:** about 10 minutes locally (5 min streaming + COPY, 5 min upserts and indexes).
- **Search:** `search_albums(q, lim)`. Trigram word similarity (threshold 0.3) × 1.0, plus popularity × 0.15, plus 0.1 for studio albums (the PRD's starting weights).
- **Test set:** `packages/worker/search-eval/queries.json`. Run with `pnpm search:eval`.

## Baseline — 2026-11-20

Claude's 25 edge-case searches only; the user's 25 aren't written yet.

| Metric | Result |
|---|---|
| Top-1 | **80.0%** (20/25) |
| Top-5 | 96.0% (24/25) |
| MRR | 0.880 |
| Not found | 1 |
| Latency | p50 169 ms, p95 6,659 ms, max 7,127 ms |

### Misses

| Search | Wanted | Rank | What beat it, and why |
|---|---|---|---|
| `nevermnd` | Nevermind — Nirvana | 2 | "Legends From Now and Nevermore". On a one-word typo, word similarity rewards partial matches inside longer titles. Popularity (12 links) is too weak to lift the real album. |
| `sgt peppers lonely hearts club band` | Sgt. Pepper’s… — The Beatles | 2 | A fan "Rockband Mixes" release group spelled "Sgt: Peppers". Punctuation and the curly apostrophe (`’`) stay in `search_text`, so the user's spelling matches the variant better than the real title. |
| `weezer` | Weezer (1994, Blue Album) | 2 | The 2026 self-titled Weezer album has more links (13 vs 11). With seven albums titled "Weezer", only popularity can decide, and link count doesn't favor the classic. |
| `unplugged in new york` | MTV Unplugged in New York — Nirvana | 2 | A tribute album, by 0.002. The expected album is live, so the studio-album boost works against it. |
| `mbdtf` | My Beautiful Dark Twisted Fantasy | not found | Trigram search can't expand abbreviations. |

### Speed

Multi-word queries with common words ("dark side of the moon") take **about 7 seconds**. The `<%` operator pulls a huge candidate set from the GIN index (any album sharing trigrams with "the", "of", "side"…), and word similarity is computed for each one. Short or distinctive queries take 10–300 ms. This is not acceptable for search-as-you-type and is the first thing to fix.

## Levers for the tuning task

Ordered by expected impact; each one is re-measured with `pnpm search:eval`.

1. **Speed** (partly done: Change 1 below): a two-stage query. Fetch a capped candidate set ordered by trigram distance using a GiST index (`<<->`), or with a higher threshold first, then score only those. Or strip stop-words ("the", "of") from the candidate query.
2. **Punctuation normalization:** drop punctuation and apostrophes (`’ ' . : -`) in `normalize_text()`. That needs a migration, and `search_text` regenerates.
3. **Weights:** a stronger popularity weight, and no type penalty when the query names a live/compilation word ("unplugged", "live", "greatest hits"). Try with `pnpm search:eval --weights`.
4. **Exact-title bonus:** a boost when the normalized query equals the title or title + artist. That fixes self-titled and short-title cases.
5. **Aliases:** release-group and artist aliases from the dump (CC0), for abbreviations like "MBDTF" and alternate spellings.
6. **Better popularity:** link count is a weak proxy (it favored the 2026 Weezer). The 7 GB Postgres dump gives real release counts; ListenBrainz is planned for Phase 5.

Not yet needed: a secondary search source (Apple Music / Deezer). Decide after tuning, once the user's 25 searches are in.

## Change 1 — threshold 0.3 → 0.5 (2026-11-21)

Short common-word searches ("green day", "all time low") timed out on the website: the anon role's 3 s statement timeout cancelled them. At threshold 0.3 "green day" matched ~65k albums, and scoring and sorting them took 6–8 s. Measured with `pnpm search:eval --weights "1,0.15,0.1" --threshold …`:

| Threshold | Top-1 | p50 | p95 | Max |
|---|---|---|---|---|
| 0.3 (baseline) | 80.0% | 454 ms | 7,498 ms | 8,454 ms |
| **0.5 (chosen)** | 80.0% | 115 ms | 472 ms | 622 ms |
| 0.6 | 80.0% | 54 ms | 214 ms | 250 ms |

Accuracy and misses are identical at all three. 0.5 leaves more room for typos than 0.6 while staying well under the timeout. Migration `20261121120000_search_threshold.sql`. As anon: "green day" 295 ms, "all time low" 254 ms, "dark sid of teh moon" still finds Pink Floyd first.

Still slow: a lone very common word ("the") takes about 3 s because nearly every album matches. Handle it in tuning (e.g. stop words or a minimum word length).
