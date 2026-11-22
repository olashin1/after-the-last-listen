# Decisions

Open and settled decisions that aren't in `docs/prd.md`. Newest first.

## 2026-11-22: Profile pictures on user pages, reviews in the diary (decided with the user)

- **A user's Albums and Diary pages show their profile picture** next to the heading (`ProfileHeading` in `components/profile-nav.tsx`). It links to the profile and uses the letter placeholder when there's no upload. The profile page already had one.
- **Diary rows show the album's review**, under the artist and above the Shooting Star. A review belongs to the album, not to one listen, so `get_diary()` returns it **only on that album's most recent listen**. Older rows of a re-logged album stay as they were, so the text isn't repeated (migration `20261122090000_diary_review.sql`). Rows without a review are unchanged.
- **The profile page has two sections under the card:**
  - **Recently listened:** the 3 most recently listened albums as cover tiles, sharing `AlbumTile` with My Albums.
  - **Recent reviews:** the 3 most recently listened albums that have a review, as cards with cover, title, artist, rating, the review (clamped to 4 lines) and the Shooting Star.
  - Both come from `get_collection()`, which now also returns `review` and takes `p_reviewed_only` (migration `20261122100000_collection_reviews.sql`), so RLS still hides them on private profiles.
  - With no logs, the owner sees "No logs yet" with a Log button; others see that the user hasn't logged anything. The review section is hidden when there are no reviews.
- **The diary is about 1.5× bigger:**
  - covers 72 px (was 48)
  - album titles `text-lg`
  - artist, date, review and Shooting Star at regular text size instead of small
  - stars 26 px
  - a wider column (`max-w-3xl`)
- **Branch:** `feat/profile-pages`, stacked on `feat/design-purple` (PR #8).

## 2026-11-21: Purple colour scheme and rounded stars (decided with the user)

- **Soft purples, light and dark,** following the system setting. The palettes are Tailwind v4 `@theme` tokens in `apps/web/app/globals.css`:
  - `plum`: muted purple-greys for text, borders and surfaces. It replaced Tailwind's `zinc` everywhere.
  - `iris`: a softer violet accent for buttons, focus rings, rating stars and the active tab. It replaced `violet`.
  - `star`: a muted gold, **kept for the Shooting Star** so it stands apart from rating stars. It replaced `amber`.
  - Red (errors) and green (success) are unchanged.
- **Page colours:** light is `#faf8fd` with `#241b33` text, dark is `#16121e` with `#ece6f5`. `color-scheme` and `accent-color` make native controls (radios, scrollbars, the date picker) match. The body now uses the Geist font the layout loads, instead of the starter's Arial.
- **Stars:** every star is one SVG (`components/star-icon.tsx`), a five-point polygon stroked in its own colour with round joins, so the points are rounded. Rating stars are 1.5× bigger:
  - log form: 48 px
  - album page: 30 px
  - My Albums and diary: 21 px
  - default: 24 px
- **Shooting Star markers** use the same shape in gold, at 1.5× the text size.
- **Header:** search, My Albums and Log +, then the account menu at the far right: your avatar and @username open a small menu with Profile, Diary, Settings and Sign out (`components/account-menu.tsx`). It closes on Escape or a click outside. On narrow screens only the avatar shows.
- **Branch:** `feat/design-purple`, stacked on `feat/phase-3-logging` (PR #7).

## 2026-11-21: No Redis for now

- **Asked:** would Redis make the web app faster? **No, not today.** Where time goes:
  - **Search** (`search_albums`, p50 122 ms, p95 913 ms): a result cache would only help repeated identical queries, and search-as-you-type sends many distinct ones. The slow cases are long multi-word queries, which need query or index work.
  - **Tracklists:** already cached in Postgres (`catalog.tracks`); pre-warming (Phase 5) removes the cold misses.
  - **Album, collection and diary reads** are small indexed queries that Postgres keeps in memory. Caching private data in Redis would also move the privacy checks (RLS) out of the database.
  - **Cover art** is cached by the browser, and auth uses Supabase JWTs. Neither would gain anything.
- **The one real candidate is the shared MusicBrainz rate limit** across server instances (a before-launch item). That's about staying within MusicBrainz's limit, not speed. Try a Postgres-based limiter first (one row handing out the next allowed send time); use a hosted Redis such as Upstash only if that falls short.
- **Performance work that would help instead:** bring search p95 toward the PRD's 200 ms, pre-warm tracklists, and store "last listened" on `user_albums` if My Albums gets slow.

## 2026-11-21: Logging UI and My Albums (decided with the user)

- **A purple "Log +" button** sits at the right of the header when you're signed in. It opens one app-wide pop-up (a native `<dialog>` in the root layout, `components/log/log-dialog.tsx`): first a search (debounced 300 ms, local search plus the live MusicBrainz fallback when results are weak), then the log form. **An album page has its own Log button** that opens the form straight on that album. "Edit" opens the same form without a date and doesn't add a listen.
- **Logging an album already in your albums** opens the form prefilled with your rating, review and Shooting Star. Saving replaces them with what's in the form and adds a new dated listen, so the album is still one tile in My Albums and several rows in the diary. `log_album()` only touches the row when a value actually changed, so `updated_at` means "last edited" (the merge rule relies on it).
- **My Albums is `/u/[username]/albums`**: a cover grid, most recently listened first, with rating and Shooting Star, and "No logs yet" when empty (with a Log button for the owner). Other people can see a public user's albums; a private user's albums show "This profile is private" (enforced by RLS in `get_collection`). `/albums` and `/diary` redirect to your own pages. The basic diary is `/u/[username]/diary`.
- **Writes are `security definer`** (`log_album`, `update_user_album`): the tables stay SELECT-only for clients, and the functions take the user from `auth.uid()` only. Reads (`get_user_album`, `get_collection`, `get_diary`) are `security invoker`, so RLS still applies.
- **Shooting Star check:** the recording must be on the stored tracklist, **or be the entry's current pick**, so a prefilled re-log or edit works when the tracklist isn't loaded or has changed upstream. A different star needs the tracklist. With no tracklist, the form says the star can be added later.
- **Dates:** `listened_on` from 1900 onwards, and not after the client's local "today". "Today" must be within a day of the server's UTC date.
- **Retired albums** that weren't merged can still be logged from their page. A merged album's page redirects to the survivor, and `getLogContext` follows the merge too.
- **My Albums ordering is computed per request** (latest listen per album, with a lateral join). That's fine at MVP sizes; add a stored "last listened" column if large collections get slow.
- **Known, not from this change:** in dev, every page logs "`Date.now()` while prerendering" from Supabase's auth client (`getClaims` in the header) under Cache Components, and the Grammarly extension causes a hydration warning on `<body>`.

## 2026-11-21: Phase 3 plan (decided with the user)

- **Steps:** `user_albums` and `listens` tables with RLS; `log_album()`; `update_user_album()` (rating, review, Shooting Star; how a star is "added later"); read functions `get_user_album()` and `get_diary()`; merges in `apply_album_redirect()`; logging on the album page; a basic diary.
- **`listens.user_id` (departs from PRD §6):** listens also store the owner, tied to the parent by a composite FK `(user_album_id, user_id) → user_albums(id, user_id)`. RLS and the diary index `(user_id, listened_on desc, created_at desc)` then need no join, and the FK keeps the two consistent.
- **Double taps:** each log submit sends a client-generated request UUID, stored unique on `listens`; a repeat submit returns the existing listen instead of adding one (PRD §10, idempotent logging).
- **Future dates:** `log_album()` takes the client's local date (PRD §9) and rejects it unless it's within one day of the server's UTC date, so a client can't claim a far-future "today".
- **Merged albums** can't be logged (`album_merged`); their page already redirects. Retired albums that weren't merged can still be logged.
- **Length limits (not in the PRD):** reviews 5,000 characters, listen notes 500. Blank text is stored as NULL.
- **Clients only read `user_albums` and `listens`;** every write goes through RPC, and the service role is also read-only until the merge step grants what it needs. `updated_at` is set by a trigger on every update.
- **Read functions, not table reads,** because the `catalog` schema isn't in the Data API, so PostgREST can't join `user_albums` to albums. They're `security invoker`, so RLS still applies.
- **Merge rule:** when a merged album's `user_albums` move to the survivor and the user logged both, all listens move to the survivor's entry, and rating, review and Shooting Star come from whichever entry was updated most recently. A star not on the survivor's tracklist is kept (its title is stored). Favorites follow in Phase 5 with `profile_favorites`.
- **Diary in Phase 3:** a basic `/u/[username]/diary` (newest first, cover, date, rating, Shooting Star, "load more" by cursor), hidden on private profiles by RLS. Filters, Log Again, and edit/delete of listens stay in Phase 4.

## 2026-11-21: Tracklist storage (decided with the user)

- **Keep the PRD's middle ground:** tracklists load on demand and stay cached in `catalog.tracks`. A pre-warm job loads the most popular albums (about the top 50k) ahead of time.
- **We don't store every album's tracklist.** It would be about 35M rows, roughly 5–6 GB with indexes (estimate), from a 7–21 GB dump. Every weekly sync would rewrite it, and most of it would never be viewed.
- **Why pre-warm at all:** a MusicBrainz outage, like the 503s on 2026-11-21, leaves an album page without its tracklist. With pre-warming, nearly every page people open is instant and doesn't depend on MusicBrainz.
- **Phase 3 follow-up:** if an album's tracklist isn't loaded, logging still works; the Shooting Star can be added later.

## 2026-11-21: Catalog sync, merges, live search fallback

- **One sync command, `pnpm catalog:sync`** (`packages/worker/src/sync.ts`). It runs the release-group upsert, then canonical releases, then lookups of vanished albums. Each step commits on its own, so a failure at any point leaves the previous catalog searchable (PRD §10). Runs are recorded in `catalog.sync_runs`. An advisory lock allows one sync at a time.
- **Vanished albums:** active `dump` albums missing from a new dump go into `catalog.sync_vanished` in the same transaction as the upsert. Each is then looked up through the API, one at a time and outside that transaction:
  - A different MBID back means a merge.
  - A 404, or a type that's no longer Album or EP, means it's retired.
  - Anything else is kept, because the dump was behind.
  - At most 1500 lookups per run (2 s apart, about 50 minutes). The rest wait for the next run and stay searchable meanwhile.
- **Safety guard:** the upsert rolls back if the dump has fewer than 95% of the active albums, or if more than 2% of them vanished. This protects against a truncated or wrong download.
- **Albums back in a dump are un-retired**, unless they were merged.
- **Merges** (`catalog.apply_album_redirect`):
  - If the survivor is already in the catalog, the old row is retired and `merged_into_id` points at it. Chains are flattened, and the album page redirects (308).
  - If the survivor isn't in the catalog, the old row takes the new MBID and keeps our ID.
  - The redirect is recorded in `catalog.mbid_redirects` either way.
  - **Open (Phase 3):** move `user_albums` and favorites from a merged album to its survivor, handling a user who logged both.
- **`merged_into_id` is a deferrable foreign key** (checked at commit), so the data-only `catalog:restore` can load rows in any order.
- **Live search fallback:**
  - **When it runs:** when local search returns nothing, or its best `match` (word similarity, now returned by `search_albums`) is under `WEAK_MATCH`. Match is used rather than score, because popularity can push a poor text match high. The value and how it was chosen are below.
  - **The search:** one MusicBrainz release-group search (Albums and EPs, limit 10). It's skipped when the same normalized query went to MusicBrainz in the last 7 days (`catalog.live_searches`), and when the adapter's queue wait is over 2.5 s.
  - **What it stores:** results go into the catalog with `add_live_albums()` (service role only) as `source = 'live'`. Existing albums are never changed, and MBIDs merged away are skipped.
  - **Provisional canonical release:** the first official release in the result, so the album page can load tracks straight away. The next canonical dump replaces it.
  - **The page:** local results show immediately, and the MusicBrainz results stream in underneath. Failures show nothing extra.
- **Fallback threshold `WEAK_MATCH = 0.8`** (`apps/web/lib/search.ts`), chosen with `pnpm search:eval`. 4 of the 50 test queries fall under it. Three are typos already ranked correctly (the lowest correct top-1 match is 0.61, and 10% of correct matches are under 0.88), and the fourth is the `mbdtf` miss. So about 8% of searches make at most one extra API call per query per week, and local results never wait for it. Revisit with real search logs and real new-release searches. No release newer than the dump was available on 2026-11-21 to test end to end.
- **MusicBrainz was flaky on the first run** (503s and 10 s timeouts on about a fifth of lookups). Failed lookups stay queued and the fallback shows nothing extra, so neither is user-visible.
- **Retries with backoff (added later the same day):** the adapter retries 502, 503 and 504 responses, timeouts and network errors. It waits 2 s, then 4 s, plus up to half that again at random, and allows 2 retries by default. The rate-limit docs (checked 2026-11-21) give no back-off advice and no `Retry-After` header; one is honoured, capped at 30 s, if it ever appears. Responses do carry undocumented `X-RateLimit-Limit` (1900), `X-RateLimit-Remaining` and `X-RateLimit-Reset` (about 1 s ahead) headers. That looks like a shared bucket refilled every second, which would explain 503s on well-spaced requests on busy days. Our waits already outlast its reset, so we don't read these headers. The live fallback uses `retries: 0`, because the searcher is waiting.
- **The album page's tracklist streams in its own Suspense boundary**, so retries never hold up the cover, title or (in Phase 3) the logging form.
- **`pnpm catalog:sync --lookups-only`** retries the queued vanished albums without downloading or loading dumps.
- **Live albums aren't checked for vanishing**, because they may be newer than the dump. They become `dump` albums once a dump includes them. A live album that MusicBrainz later deletes stays active. That's rare and harmless, and can be revisited later.
- **`/search` is now the real search page** (public, with a search box in the header). `DEBUG_TOOLS` only adds the score and match to each result.
- **Schedule (decided with the user):** a GitHub Actions workflow, `.github/workflows/catalog-sync.yml`, runs every Sunday at 06:00 UTC (after the Saturday JSON dump) and on demand. It's inactive until the `CATALOG_DATABASE_URL` secret is set, which needs a hosted project. Use the session pooler: runners are IPv4-only, and the advisory lock needs a session.

## 2026-11-21: Phase 2 plan, shared MusicBrainz adapter

- **Plan (decided with the user):** MBID redirects come from API lookups of only the albums that vanish from a new dump (the JSON dumps have no redirects, and the docs don't confirm that the 7 GB Postgres dump has them). The weekly sync runs as a GitHub Actions cron, inactive until a hosted database exists.
- **The adapter is now a workspace package, `packages/musicbrainz`**, so the sync worker can call the API too. `createMusicBrainzClient({ minIntervalMs })` gives each process its own queue. The web app's client (`apps/web/lib/musicbrainz.ts`) spaces requests 1.1 s apart, the same as before. The track mapper moved with it. The web app loads the package through `transpilePackages` and `allowImportingTsExtensions`. The worker runs it with type stripping (Node resolves the workspace symlink, so the files aren't under `node_modules`).
- **Fail fast when busy:** `get(..., { maxQueueWaitMs })` throws `MusicBrainzBusy` without sending anything when the queue wait would be longer than that. It's for the live search fallback, so a search never waits behind a queue.
- **Worker and web share one IP limit.** Their queues are separate, so the worker's redirect lookups use a 2 s interval. That keeps the two together at about 1 request per second.

## 2026-11-21: Album page, cover art, tracklists

- **Canonical edition (decided with the user):** each album shows the tracklist of MusicBrainz's canonical release, from the canonical data dump (`canonical/canonical_release_redirect.csv`, CC0, refreshed on the 1st and 15th). `pnpm catalog:canonical` loads it into `catalog.albums.canonical_release_mbid`. The archive is 2.4 GB `.tar.zst`; the system `tar` must read zstd (Windows' built-in `tar.exe` does; Git Bash's GNU tar needs a separate `zstd`).
- **Tracklists load on demand** (PRD §7). The first visit to `/album/[id]` fetches `release/<canonical>?inc=recordings` from the MusicBrainz API and stores it with `set_album_tracks()`. `catalog.albums.tracks_release_mbid` records which release the stored tracks came from, so a changed canonical release shows as stale (`get_album().tracks_current`) and reloads on the next visit. If MusicBrainz fails, the page shows the album without tracks (or the older tracks) and retries next time.
- **`catalog.tracks` rows can be deleted by the service role.** They're a replaceable cache of upstream data that nothing references by our IDs; the Shooting Star (Phase 3) stores a recording MBID and a copy of the title. Albums and artists still can't be deleted.
- **`set_album_tracks()` is in `public`** so supabase-js can call it over RPC (the `catalog` schema isn't exposed), but only the service role can execute it. It refuses tracks for a release other than the current canonical one (`release_mismatch`) and row-locks the album, so two simultaneous first visits write one after the other.
- **Service role in the web app:** `SUPABASE_SECRET_KEY` in `apps/web/.env.local`, read only by `lib/supabase/admin.ts` (server-only, no `NEXT_PUBLIC_` prefix), used only for `set_album_tracks()`.
- **MusicBrainz API adapter:** `apps/web/lib/musicbrainz.ts` (checked the rate-limiting docs 2026-11-21: about 1 request/second per IP, 503 when over). Requests are queued 1.1 s apart, time out after 10 s, and retry once after a 503. The queue is per server process: several instances (e.g. serverless) would each have their own, so revisit before deploying. The Phase 2 sync worker should move this into a shared package.
- **User-Agent contact (decided with the user):** the project's public GitHub URL, `AfterTheLastListen/0.1 ( https://github.com/olashin1/after-the-last-listen )`. Also used for dump downloads.
- **Album page is a real page** (decided with the user), `/album/[id]`, public like the rest of the catalog. Retired albums still open. Today it's reached from the debug search.
- **Cover art:** Cover Art Archive images by release-group MBID (`front-250` for search thumbnails, `front-500` on the album page), shown with a plain `<img>` and a placeholder for 404s (common). Nothing is stored. The album page credits MusicBrainz and the Cover Art Archive with links.
- **Open: Cover Art Archive terms.** Its API docs (checked 2026-11-21) state no licensing or attribution terms and say rate limits aren't enforced. Images are uploaded by the community, and their copyright belongs to the rights holders. Confirm the terms and attribution wording before launch.

## 2026-11-20: Search spike (MusicBrainz import, `search_albums`, test set)

- **Source:** the MusicBrainz JSON dump `release-group.tar.xz` (1.27 GB, from `data.metabrainz.org/pub/musicbrainz/data/json-dumps/`, checked 2026-11-20). One JSON record per line. It isn't the MusicBrainz API, so the rate-limited adapter doesn't apply; the download still sends a descriptive User-Agent and is checked against the published SHA-256.
- **License handling:** core MusicBrainz data is CC0. Annotation, genres, ratings and tags are CC BY-NC-SA, so the import never stores them (a unit test checks they don't survive mapping). MusicBrainz attribution is recommended; add a footer credit before launch.
- **Scope (decided with the user):** all release groups with primary type Album or EP, so the accuracy number reflects real competition from tributes, covers and same-named albums.
- **No releases in the dump**, so there's no `release_count` and no "has an official release" filter (PRD §7). Albums whose only releases are bootlegs stay in for now. `release_count` stays 0, meaning unknown. The 7 GB Postgres dump could supply both later.
- **Popularity proxy (decided with the user):** the number of URL relationships (Wikidata, AllMusic, Discogs, reviews…), stored as `catalog.albums.link_count`. `popularity = least(1, ln(1 + link_count) / ln(51))`, so 50+ links scores 1.0. It can be recomputed without re-importing. ListenBrainz and our own log counts replace it in later phases.
- **Import:** `pnpm catalog:import` (`packages/worker`) streams the archive with the system `tar` (no npm xz dependency). It `COPY`s every kept album into a session temp table, then upserts artists, albums and credits in one transaction. Unchanged rows aren't rewritten, so re-running the same dump changes nothing. It doesn't retire albums missing from the dump or apply MBID redirects; that's the Phase 2 sync worker.
- **Dependencies:** `postgres` 3.4.9 (worker), because streaming `COPY` of millions of rows isn't practical over the Supabase REST API. The 3.x line was chosen over the three-week-old 4.0. `vitest` 5.1.0 in the worker too. The worker runs TypeScript with `node --experimental-strip-types` (Node 22.15), so there's no build step and no `tsx`.
- **The import connects with `DATABASE_URL`** (`packages/worker/.env.local`) and refuses non-local hosts without `--allow-remote`.
- **`search_albums` is `security definer`**, a change from the plan's security invoker. Clients would otherwise need EXECUTE on the tunable core `catalog.search_albums_weighted()`, where a tiny match threshold could scan the whole catalog. The definer function only applies fixed weights and only returns non-retired catalog rows, which are public anyway. The core is executable by the service role (and the eval script's owner connection) only.
- **Matching:** `pg_trgm` word similarity (`<%`, threshold 0.3) on `search_text`, through a partial GIN index that skips retired albums. The query is normalized with the same `catalog.normalize_text()` as `search_text`. Queries under 2 characters return nothing; `lim` is clamped to 1–50 (default 20).
- **Test set (decided with the user):** 50 searches in `packages/worker/search-eval/queries.json`, 25 written by the user and 25 edge cases by Claude. (Changed 2026-11-21: Claude wrote all 50; see below.) `pnpm search:eval` reports top-1 (the PRD target), top-5, MRR and latency, and lists every miss.
- **Catalog tests use invented names and fake MBIDs**, so they pass on an empty catalog and on a full import.
- **Debug tools behind `DEBUG_TOOLS=true`** (`apps/web/.env.local`, default `false` in `.env.example`). It turns on a `/search` test page that calls `search_albums()` and shows each result's score and type, plus a "Search (debug)" header link. When it's off, `/search` returns 404 until the real album search page is built (Phase 2). The flag is server-only (`lib/debug.ts`). Keep it off in any deployed environment.

## 2026-11-20: Catalog schema

- **Scope:** `catalog.artists`, `catalog.albums`, `catalog.album_artists` and `catalog.mbid_redirects`. `catalog.tracks` waits for on-demand tracklists (Phase 2). The trigram index on `search_text` comes with `search_albums()`, where the index type gets chosen while tuning.
- **IDs:** `bigint generated always as identity`. MBIDs are `uuid` columns with unique constraints.
- **Never deleted, enforced:** the service role has no DELETE on `artists` or `albums`, and triggers block DELETE and TRUNCATE for every role, including the table owner. `album_artists` rows can be deleted, so credits can be rewritten when upstream changes them; `mbid_redirects` has no DELETE because redirects are permanent. `retired` is on artists too, since CLAUDE.md's no-delete rule covers every catalog row (the PRD lists it only on albums).
- **Readable by everyone:** `anon` and `authenticated` have SELECT only, and RLS is on with a `using (true)` select policy as a second layer. The `catalog` schema isn't exposed in the Data API (`config.toml` `api.schemas`). Clients reach it through `public` RPC functions such as `search_albums()`. Revisit if the album page needs direct reads.
- **`search_text` is a generated column** from `catalog.search_key(title, artist_credit)`, so it can't drift from the title or credit. Normalization (PRD §7) is lowercase, unaccented, whitespace collapsed, with a leading "the" removed from the title and from the artist credit separately ("The Beatles" → "beatles"). The PRD's wording was ambiguous about which part loses the "the"; this keeps artist searches like "beatles abbey road" working.
- **`primary_type` is limited to `Album` and `EP`** by a check constraint, matching the PRD §7 import filter. Live albums, compilations and soundtracks keep their flag in `secondary_types`.
- **`first_release_date` is text** (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), because MusicBrainz dates are often partial. It still sorts correctly as text.
- **`mbid_redirects` has an `entity` column** (`artist`, `release_group`, `recording`). Recording redirects will matter for Shooting Stars, which store a recording MBID.
- **Generated types now include the `catalog` schema** (`pnpm db:types`).

## 2026-11-20: Avatar upload

- **Limits** (PRD §8 only says "limit size/type"): stored files are at most 2 MB and JPEG, PNG or WebP. GIFs aren't allowed (animation adds size and moderation issues). The `avatars` bucket enforces both; it's created by the avatars migration, not `config.toml`, so local and hosted match.
- **The browser crops and resizes before upload:** center-crop to a square, at most 512px, re-encoded as WebP (JPEG where the browser can't encode WebP), using a canvas with no new dependency. This also strips EXIF data such as GPS location. Originals up to 20 MB are accepted for resizing. There's no crop UI; add one later if people ask.
- **Upload goes straight from the browser to Storage**, then a Server Action calls `set_avatar(path)`. This avoids the 1 MB Server Action body limit and proxying the file. `set_avatar` checks that the file exists in the caller's folder and that the caller owns it, so a profile can't point at someone else's file.
- **`profiles.avatar_url` stores the object path** (`{user_id}/{uuid}.{ext}`), not a full URL, so it survives a change of host. `lib/avatar.ts` builds the public URL. Each upload gets a new name, so caches never show a stale image (files are served with a one-year cache).
- **The bucket is public:** profile cards (including the avatar) are always public (see the 2026-11-17 decision). Writes are limited to the user's own folder by `storage.objects` policies.
- **Old files are deleted through the Storage API.** Supabase blocks `DELETE` on `storage.objects` from SQL, so `set_avatar` / `remove_avatar` return the previous path (read under a row lock) and the Server Action deletes it with the user's session. If that delete fails, the file is orphaned but nothing breaks.
- **Open: orphaned files.** Files are left behind by a failed delete, by an upload whose `set_avatar` call never ran (e.g. the tab closed), and by account deletion (`profiles` cascades, Storage doesn't). A cleanup job that removes files no profile points at is needed before launch.
- **Display uses a plain `<img>`, not `next/image`.** Next 16's image optimizer refuses local IPs by default (the local Supabase is 127.0.0.1), and the files are already 512px. Revisit with `images.remotePatterns` for the hosted project.
- **Unit tests: Vitest** (`pnpm test`, now part of `pnpm check`), added with the first TS module that has logic (`apps/web/lib/image.ts`, the crop math).

## 2026-11-17: Profiles and auth

- **Private profiles keep their card visible.** Anyone can see a private user's username, display name, bio and avatar. Their collection, diary, ratings and reviews are owner-only. This follows PRD §5 ("private profiles hide collection, diary, ratings, and reviews") and keeps usernames findable for follows later. Future tables enforce it through `can_view_user_content(owner)` in their RLS policies; extend that function for follows in the Social phase.
- **Profile edits go through an `update_profile()` RPC**, the same as the core writes. Clients have SELECT only on `profiles`; profile rows are created by the `handle_new_user()` trigger on `auth.users`.
- **Username rules:** 3–20 characters of `a–z`, `0–9`, `_`. Stored lowercase, unique regardless of case, and changeable. A released username can be taken by someone else straight away.
- **Field limits** (not in the PRD): display name 1–50 characters, bio 1–300. Empty strings are stored as NULL.
- **Avatar upload was deferred** to its own task (done 2026-11-20, see above).
- **Auth settings:** email confirmation on (matches hosted Supabase), minimum password length 8. Email links use `token_hash` and the `/auth/confirm` route, with templates in `supabase/templates/`. **The hosted project needs the same settings and templates set in the dashboard.**
- **A sign-up rejected by the trigger reaches supabase-js as a 500 with no error code** ("Database error saving new user"). Auth hides the trigger's message when the API version header that supabase-js sends is present. So the sign-up action pre-checks with `check_username()`, and checks again after a failed sign-up to explain a lost race.

## 2026-11-17: Phase 1 scaffold

- **Moved the create-next-app project from the repo root into `apps/web`** using `git mv`, to keep history and the pinned Next 16.4.6 / Tailwind 4.3.3 versions. The root `AGENTS.md` was removed: `next dev` now maintains `apps/web/AGENTS.md`, and the root copy pointed at a `node_modules/next` that pnpm does not hoist to the root.
- **Supabase CLI is a root devDependency** (`supabase` on npm), run as `pnpm supabase …`. It pins the CLI version and avoids a global install.
- **pgTAP is not installed by migration.** `supabase test db` enables pgTAP for the run and drops it afterwards (Supabase CLI docs, checked 2026-11-17). So there are no migrations yet; the first one will be the app schema.
- **No unit-test runner yet.** There's no TypeScript logic to test. Add one (likely Vitest) with the first TS module that has logic, such as the MusicBrainz adapter.
- **Auth session refresh lives in `apps/web/proxy.ts`** (Next 16 renamed `middleware.ts` to `proxy.ts`) and uses `getClaims()`, following the current Supabase SSR guide. (Since the profiles/auth task it also redirects signed-out visitors away from `/settings` and `/reset-password`.)
- **Env var names:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key, not the legacy anon key).

## 2026-11-21: Search tuning, Phase 1 closed

- **Test set (decided with the user):** the user chose not to write their 25 searches. Claude wrote 25 everyday searches instead (`claude-everyday` in `queries.json`), with expected albums checked against the catalog and saved before tuning so they work as a held-out check. This departs from the PRD's "50 real searches": none of the 50 come from real users. Revisit with real search logs once people use the app.
- **Normalization:** `normalize_text()` now drops apostrophes and periods, so "sgt peppers" matches "Sgt. Pepper’s" and "maad" matches "m.A.A.d". Other punctuation stays (pg_trgm already treats it as a word break).
- **Weights:** similarity 1.0, full similarity 0.1 (new `p_w_full` argument on the core), popularity 0.3 (was 0.15), type 0.1, threshold 0.5. No exact-match bonus: it didn't improve the score.
- **Result:** 94% top-1 (47/50), so Phase 1's search target is met and no secondary search source is recommended. Known misses (`sgt pepper`, `weezer`, `mbdtf`) need better popularity (ListenBrainz, Phase 5) or aliases.
