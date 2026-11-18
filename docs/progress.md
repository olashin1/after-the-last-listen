# Progress

Status of each phase in `docs/prd.md` §12. Updated at the end of every task (see CLAUDE.md).

Last updated: 2026-11-17

## Phase 1: Foundation + search spike (in progress)

Done when: a user can register, sign in and edit their profile; and the correct album ranks first for ≥ 90% of test searches, or the spike recommends a secondary search source.

- [x] Project scaffold: pnpm monorepo, Next.js + Tailwind in `apps/web`, local Supabase, Supabase clients and session refresh, pgTAP test harness, lint/typecheck (branch `chore/scaffold`, not merged yet)
- [ ] Auth: sign-up and sign-in pages, route protection in `apps/web/proxy.ts`
- [ ] Profile: `profiles` table, created on sign-up, with an edit-profile page
- [ ] App schema (open question: profiles only for now, or every §6 app table?)
- [ ] RLS on every user-owned table, with cross-user access tests
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
