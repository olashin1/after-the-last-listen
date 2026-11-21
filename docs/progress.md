# Progress

Status of each phase in `docs/prd.md` §12. Updated at the end of every task (see CLAUDE.md).

Last updated: 2026-11-21

## Phase 1: Foundation + search spike (in progress)

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
- [ ] A 50-query test set of real searches, each with its expected album: 25 of 50 done (Claude’s edge cases). **Waiting on the user’s 25** in `packages/worker/search-eval/queries.json`; eval with `pnpm search:eval`
- [ ] Tune ranking to ≥ 90% correct first result, or write up a recommendation for a secondary search source. Baseline 80% top-1, p95 6.7 s; see `docs/search-spike.md`

## Phase 2: Catalog (in progress)

Done when: a user can reliably find and inspect an album, including new releases; a failed sync leaves search working.

- [ ] Full sync worker (`packages/worker`)
- [x] Canonical release mapping (`pnpm catalog:canonical`)
- [ ] MBID redirects
- [x] On-demand tracklists: `catalog.tracks`, `set_album_tracks()`, rate-limited MusicBrainz adapter in the web app, album page `/album/[id]`
- [x] Artwork: Cover Art Archive covers in search results and on the album page, with a placeholder
- [ ] Live search fallback through the rate-limited MusicBrainz adapter
- [ ] Weekly sync schedule

## Developer tooling (not a PRD phase)

- [x] Debug search page `/search` behind `DEBUG_TOOLS=true`: results with covers, type and score, linking to album pages
- [x] Seeded local test accounts on every reset: `alice@demo.test` (public) and `bob@demo.test` (private), password `password123` (`supabase/seed.sql`)
- [x] Migration workflow: `migration up` while developing; `db:reset` + `pnpm check` before committing or merging (CLAUDE.md)
- [x] Catalog snapshot and restore (`pnpm catalog:snapshot` / `pnpm catalog:restore`): snapshot 40 s (293 MB), reset 34 s, restore about 6 min, versus about 22 min to re-import; tested 2026-11-21 (albums, canonical releases, credits, loaded tracks, seeded accounts and search all came back)

## Phase 3: Core logging (not started)

Done when: one action saves both the collection record and the diary date; the Shooting Star shows on the album page and in the diary.

- [ ] `log_album` function
- [ ] Rating, review, Shooting Star
- [ ] First listen
- [ ] Shooting Star display

## Phase 4: Diary (not started)

Done when: a repeat album appears several times in the diary but once in the collection.

- [ ] Chronological timeline
- [ ] Log Again with a note
- [ ] Filters
- [ ] Edit and delete listens
- [ ] Remove an album

## Before launch (carried from earlier phases)

- [ ] MusicBrainz and Cover Art Archive attribution site-wide, and confirm the Cover Art Archive terms (see `docs/decisions.md`)
- [ ] MusicBrainz adapter: shared rate limit across server instances before deploying (see `docs/decisions.md`, 2026-11-21)
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
