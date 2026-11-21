# Progress

Status of each phase in `docs/prd.md` §12. Updated at the end of every task (see CLAUDE.md).

Last updated: 2026-11-20

## Phase 1: Foundation + search spike (in progress)

Done when: a user can register, sign in and edit their profile; and the correct album ranks first for ≥ 90% of test searches, or the spike recommends a secondary search source.

- [x] Project scaffold: pnpm monorepo, Next.js + Tailwind in `apps/web`, local Supabase, Supabase clients and session refresh, pgTAP test harness, lint/typecheck
- [x] Auth: email/password sign-up (with username), email confirmation, sign-in, sign-out, password reset; `/settings` and `/reset-password` require a session (branch `feat/profiles-auth`, not merged yet)
- [x] Profile: `profiles` table created on sign-up, `update_profile()` RPC, edit-profile page, public `/u/[username]` page with private toggle (branch `feat/profiles-auth`, not merged yet)
- [x] Avatar upload: public `avatars` bucket (2 MB, JPEG/PNG/WebP), per-user Storage policies, `set_avatar()` / `remove_avatar()` RPCs, browser crop/resize to 512px, avatar on settings, profile page and header (branch `feat/profiles-auth`, not merged yet)
- [x] App schema for Phase 1: `profiles` only. The other §6 app tables arrive with the phases that use them (decided 2026-11-17).
- [x] RLS on every user-owned table, with cross-user access tests (so far just `profiles`; `can_view_user_content()` is ready for the collection and diary tables)
- [ ] `catalog` schema (artists, albums, album_artists, mbid_redirects)
- [ ] Import a slice of the MusicBrainz dump (one-off script; check the current dump format and license first)
- [ ] `search_albums(q, lim)` with a trigram index
- [ ] A 50-query test set of real searches, each with its expected album (open question: who writes it?)
- [ ] Tune ranking to ≥ 90% correct first result, or write up a recommendation for a secondary search source

## Phase 2: Catalog (not started)

Done when: a user can reliably find and inspect an album, including new releases; a failed sync leaves search working.

- [ ] Full sync worker (`packages/worker`)
- [ ] Canonical release mapping
- [ ] MBID redirects
- [ ] On-demand tracklists
- [ ] Artwork
- [ ] Live search fallback through the rate-limited MusicBrainz adapter
- [ ] Weekly sync schedule

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

- [ ] Avatar cleanup job for orphaned files; switch avatars to `next/image` with `remotePatterns` (see `docs/decisions.md`, 2026-11-20)
- [ ] Hosted Supabase: email confirmation on, minimum password length 8, the `supabase/templates/` email templates, site URL and redirect URLs (see `docs/decisions.md`)

## Phase 5: Polish & launch (not started)

Done when: core workflows work on desktop and mobile web for multiple accounts; private profiles are hidden.

- [ ] Top five favorites
- [ ] Shooting Stars view
- [ ] Empty states
- [ ] Responsive design
- [ ] Privacy toggle
- [ ] Popularity from ListenBrainz
- [ ] Tracklist pre-warming
- [ ] Validation
- [ ] QA
- [ ] Deploy

## Post-MVP

Prioritized after launch metrics are in: discovery, streaming links and embeds, follows and followed users' reviews, history import, analytics, native mobile app.
