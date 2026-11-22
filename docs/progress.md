# Progress

Status of each phase in `docs/prd.md` §12. Updated at the end of every task (see CLAUDE.md).

Last updated: 2026-11-21 (Phase 3 logging)

## Phase 1: Foundation + search spike (done)

Done when: a user can register, sign in and edit their profile; and the correct album ranks first for ≥ 90% of test searches, or the spike recommends a secondary search source.

- [x] Project scaffold: pnpm monorepo, Next.js + Tailwind in `apps/web`, local Supabase, Supabase clients and session refresh, pgTAP test harness, lint/typecheck
- [x] Auth: email/password sign-up (with username), email confirmation, sign-in, sign-out, password reset; `/settings` and `/reset-password` require a session
- [x] Profile: `profiles` table created on sign-up, `update_profile()` RPC, edit-profile page, public `/u/[username]` page with private toggle
- [x] Avatar upload: public `avatars` bucket (2 MB, JPEG/PNG/WebP), per-user Storage policies, `set_avatar()` / `remove_avatar()` RPCs, browser crop/resize to 512px, avatar on settings, profile page and header
- [x] App schema for Phase 1: `profiles` only. The other §6 app tables arrive with the phases that use them (decided 2026-11-17).
- [x] RLS on every user-owned table, with cross-user access tests (so far just `profiles`; `can_view_user_content()` is ready for the collection and diary tables)
- [x] `catalog` schema (artists, albums, album_artists, mbid_redirects): read-only for clients, service-role writes, no deletes (retire instead), generated `search_text`
- [x] Import the MusicBrainz release-group dump: all 2.97M Album/EP release groups, CC0 fields only, link-count popularity (`pnpm catalog:import`)
- [x] `search_albums(q, lim)` with a trigram index, plus a tunable core `catalog.search_albums_weighted()`
- [x] Search speed: word-similarity threshold 0.3 → 0.5, so short common-word searches ("green day") no longer hit the 3 s timeout; accuracy unchanged, p95 0.47 s (`docs/search-spike.md`, Change 1)
- [x] A 50-query test set, each with its expected album: 25 edge cases and 25 everyday searches, all written by Claude (the user chose not to write theirs, 2026-11-21), in `packages/worker/search-eval/queries.json`; eval with `pnpm search:eval`
- [x] Tune ranking to ≥ 90% correct first result: **94% top-1** (47/50), p95 0.91 s. Apostrophes and periods dropped in normalization, a full-similarity term, popularity weight 0.3; no secondary search source needed (`docs/search-spike.md`, Change 2)

## Phase 2: Catalog (done; the scheduled run waits for a hosted database)

Done when: a user can reliably find and inspect an album, including new releases; a failed sync leaves search working.

- [x] Shared MusicBrainz API adapter `packages/musicbrainz` (web app and worker), with fail-fast `maxQueueWaitMs`
- [x] Full sync worker `pnpm catalog:sync`: release groups, canonical releases, and lookups of vanished albums, each step committed on its own. Safety guard against truncated dumps; runs recorded in `catalog.sync_runs`. First real run 2026-11-21: 2.97M albums staged, 3,855 new or changed, 86 vanished, run time 19 min.
- [x] Canonical release mapping (`pnpm catalog:canonical`, also part of the sync)
- [x] MBID redirects: API lookups of vanished albums. First run: 39 merged, 13 deleted, 16 no longer albums; 18 left queued after MusicBrainz 503s and timeouts. Merged albums are retired and point at the survivor, and their pages redirect.
- [x] On-demand tracklists: `catalog.tracks`, `set_album_tracks()`, rate-limited MusicBrainz adapter in the web app, album page `/album/[id]`
- [x] Artwork: Cover Art Archive covers in search results and on the album page, with a placeholder
- [x] Reliability: the adapter retries 503s, timeouts and network errors with backoff, the album page streams its tracklist separately, and `catalog:sync --lookups-only` retries queued lookups
- [x] Real search page `/search` (public, header search box); scores only with `DEBUG_TOOLS`
- [x] Live search fallback: a top match under 0.8 (or no results) triggers one MusicBrainz search, at most weekly per query, and new albums are added with `add_live_albums()`. Tested against the live API with weak queries; adding brand-new albums is covered by SQL tests, because no release newer than the dump could be found to try it in the browser.
- [x] Weekly sync schedule: `.github/workflows/catalog-sync.yml` (Sundays 06:00 UTC), inactive until the `CATALOG_DATABASE_URL` secret exists

## Developer tooling (not a PRD phase)

- [x] Debug search page `/search` behind `DEBUG_TOOLS=true`: results with covers, type and score, linking to album pages
- [x] Seeded local test accounts on every reset: `alice@demo.test` (public) and `bob@demo.test` (private), password `password123`, plus `test@gmail.com` (username `tester`, public) for manual testing (`supabase/seed.sql`, `docs/testing.md`)
- [x] Migration workflow: `migration up` while developing; `db:reset` + `pnpm check` before committing or merging (CLAUDE.md)
- [x] Catalog snapshot and restore (`pnpm catalog:snapshot` / `pnpm catalog:restore`): snapshot 40 s (293 MB), reset 34 s, restore about 6 min, versus about 22 min to re-import; tested 2026-11-21 (albums, canonical releases, credits, loaded tracks, seeded accounts and search all came back)

## Phase 3: Core logging (in progress: everything but merges done 2026-11-21)

Done when: one action saves both the collection record and the diary date; the Shooting Star shows on the album page and in the diary. **Met** for logging and display; the merge follow-up below is what's left. Plan and decisions in `docs/decisions.md` (Phase 3 plan; Logging UI and My Albums).

- [x] Schema: `user_albums` and `listens` (with `user_id` and a request ID), RLS via `can_view_user_content()`, diary index (migration `20261121200000_user_albums_listens.sql`, tests `030_user_albums_listens.test.sql`)
- [x] `log_album` function: upsert the collection record and insert the listen in one transaction; date, rating, review and Shooting Star validation; double-tap safe (migration `20261121210000_logging.sql`)
- [x] Logging works when an album's tracklist isn't loaded; the Shooting Star can be added later (see `docs/decisions.md`, tracklist storage)
- [x] `update_user_album`: edit rating, review, Shooting Star
- [x] Read functions `get_user_album`, `get_collection` and `get_diary`
- [ ] Merges: move `user_albums` from a merged album to its survivor in `apply_album_redirect()` (most recently edited entry wins)
- [x] Log dialog: purple "Log +" in the header (search, then log), and a Log button on the album page that opens on that album; re-logging is prefilled and adds a listen
- [x] Album page: "Your log" (rating, review, Shooting Star, listens) with Edit and Log again; Shooting Star highlighted in the tracklist
- [x] My Albums `/u/[username]/albums` (cover grid, "No logs yet" empty state) and a basic diary `/u/[username]/diary`, both with Shooting Star display; header "My Albums" link
- [x] Checked in the browser 2026-11-21 (test@gmail.com): empty state, search and log with rating, review and star, a double-click saving one listen, re-log from the album page (two diary rows, one album), private albums hidden when signed out
- [x] Tests: pgTAP `030`–`035` including cross-user checks; Vitest for rating and date helpers. Verified from a clean `pnpm db:reset` + `pnpm check` on 2026-11-21 (23 SQL test files, all passing)

## Phase 4: Diary (not started)

Done when: a repeat album appears several times in the diary but once in the collection.

- [ ] Chronological timeline
- [ ] Log Again with a note
- [ ] Filters
- [ ] Edit and delete listens
- [ ] Remove an album

## Before launch (carried from earlier phases)

- [ ] Turn on the weekly sync: set `CATALOG_DATABASE_URL` (session pooler) once the hosted project exists, then run it once by hand from the Actions tab
- [ ] Phase 5: move favorites from a merged album to its survivor in `apply_album_redirect()` (`user_albums` move in Phase 3; see `docs/decisions.md`)
- [ ] MusicBrainz and Cover Art Archive attribution site-wide, and confirm the Cover Art Archive terms (see `docs/decisions.md`)
- [ ] MusicBrainz adapter: shared rate limit across server instances before deploying (see `docs/decisions.md`, 2026-11-21; try a Postgres-based limiter before Redis, see "No Redis for now")
- [ ] Avatar cleanup job for orphaned files; switch avatars to `next/image` with `remotePatterns` (see `docs/decisions.md`, 2026-11-20)
- [ ] Hosted Supabase: email confirmation on, minimum password length 8, the `supabase/templates/` email templates, site URL and redirect URLs (see `docs/decisions.md`)

## Phase 5: Polish & launch (not started)

Done when: core workflows work on desktop and mobile web for multiple accounts; private profiles are hidden.

- [ ] Top five favorites
- [ ] Shooting Stars view
- [ ] Empty states
- [ ] Visual design pass: give every page and empty space (starting with the landing page) a polished look with pictures, music-themed visuals and intentional spacing
- [ ] Responsive design
- [ ] Privacy toggle
- [ ] Popularity from ListenBrainz
- [ ] Reputable-albums filter for search: only show well-known albums, Spotify-style (deferred 2026-11-21). Likely ListenBrainz listener counts, maybe with link count; hide the rest from search with a `listed` flag rather than deleting. Check ListenBrainz batch size and data license first
- [ ] Tracklist pre-warming
- [ ] Validation
- [ ] QA
- [ ] Deploy

## Post-MVP

Prioritized after launch metrics are in: discovery, streaming links and embeds, follows and followed users' reviews, history import, analytics, native mobile app.
