# Music Album Diary

**Product Requirements & Technical Scope** | Draft v0.3 | 10 November 2026

Working concept: a Letterboxd-inspired, album-first personal music collection with a chronological listening diary and a signature "My Shooting Star" track selection.

> **What changed in v0.3**
> - Search now runs against a local album catalog (a slim, filtered copy of MusicBrainz) instead of live API calls. New Section 7 describes it.
> - Catalog schema added: our own numeric IDs with MusicBrainz IDs (MBIDs) stored alongside, merge redirects, a retired flag, and tracklists loaded on demand.
> - Canonical release chosen from MusicBrainz's published canonical release mapping rather than our own rule.
> - Search ranking defined: text match + popularity (ListenBrainz listen counts, edition count, our users' logs) + album-type boost.
> - Spotify limited to links, embeds and history-file import because its Web API is effectively closed to new small apps. Apple Music / Deezer kept as optional.
> - Phase 1 spike refocused on search ranking quality: import a slice of data and tune against 50 real searches.
>
> v0.2 (9 Nov): top five favorites, one-way follows, Shooting Star specification, release-group album identity, Postgres functions + RLS, product rules decided, success metrics.

---

## 1. Product vision and principles

- Primary job: help users remember, organize, rate, and reflect on albums they have listened to.
- Every album has one permanent user-specific collection record; each listen has a lightweight dated record.
- Logging once updates both collection and diary automatically; never require double entry.
- The Shooting Star is the app's signature: one favorite track per album, surfaced wherever the album appears.
- The app remains valuable without a social network or any connected streaming account.
- A responsive web app is the initial delivery target. A native mobile app is outside MVP scope, but the backend must be client-agnostic so mobile can be added without rewriting business logic.

## 2. Audience and key user journeys

- New user signs up, chooses username, adds bio/avatar, and chooses up to five favorite albums.
- New user with an empty collection sees a guided first-log prompt (search bar plus suggestions) instead of a blank diary.
- User searches for an album, views its artwork and tracklist, and logs it with a listening date.
- User optionally rates the album, writes a review, and picks one Shooting Star track (optional, never blocks logging).
- User opens My Albums to browse a unique-album grid; opens Diary to see every listen ordered by date.
- User listens again: taps "Log Again," picks a date (default today), optionally adds a short note, and gets a new diary row without rewriting the review.
- User edits their album rating, review, or Shooting Star; the updated values appear everywhere the album is shown.

## 3. MVP functional scope

| Area | MVP behavior | Priority |
|---|---|---|
| Authentication | Email/password sign-up, sign-in, sign-out, password reset; unique usernames | Must |
| Profile | Public profile (private toggle), username, optional avatar/bio, top five albums | Must |
| Catalog | Local album catalog (official albums and EPs) with fast, typo-tolerant, popularity-ranked search; album detail with cover, artist, release year, tracks | Must |
| Collection | One record per user/album; rating, review, Shooting Star; first-added date derived from earliest listen | Must |
| Diary | Auto-create a listen on first log; Log Again adds a dated listen with optional note; reverse chronological list | Must |
| Shooting Star | Optional pick per album; shown on album page, diary rows, and collection grid | Must |
| Navigation | Profile, My Albums, Diary, Search, Album Details; mobile-responsive | Must |
| Onboarding | Empty states for collection and diary; first-log prompt | Must |
| Management | Edit album entry; edit/delete mistaken listen; remove album with confirmation | Must |
| Shooting Stars view | Profile tab listing every Shooting Star the user has picked, like a personal playlist | Should |
| Discovery | View other public profiles and their visible collections | Could |
| Social | Follow (one-way), likes, comments, activity feed, followed users' reviews on album pages | Later |
| Streaming links | "Open in Spotify / Apple Music" buttons from MusicBrainz links; Spotify embed to preview the Shooting Star | Could |
| Import | Import listening history from a Spotify account data export (JSON upload) or Last.fm | Later |
| Analytics | Stats, annual summaries, community Shooting Star consensus | Later |

## 4. Shooting Star specification

The Shooting Star is the feature that distinguishes this product, so its behavior is specified explicitly.

| Rule | Decision | Notes |
|---|---|---|
| Required? | Optional | Never blocks or slows down a log; can be added later from the album page. |
| Cardinality | Zero or one per user-album | Changing it replaces the previous pick; no history kept in MVP. |
| Rating dependency | Independent | A Shooting Star may be set on an unrated album. |
| Track identity | MusicBrainz recording ID | Survives deluxe editions, remasters, and tracklist changes (see Section 6). |
| Valid choices | Recordings on the album's canonical tracklist | Enforced server-side in the logging function. |
| Display | Star marker + track title | Album page (highlighted in tracklist), diary row, collection grid hover/caption, Shooting Stars profile view. |
| Future | Community consensus | Aggregate most-picked Shooting Star per album (Later, Analytics). |

## 5. Screens and expected inputs

| Screen / action | User inputs | Output / validation |
|---|---|---|
| Sign up | Email, password, username | Email validation; username unique; secure session |
| Edit profile | Display name/username, bio, avatar, up to 5 album selections, visibility | Max five distinct favorites in ordered slots; accessible profile |
| Search | Search string; optional artist/album filter | Calls `search_albums()` on the local catalog; debounced; live MusicBrainz fallback for missing or brand-new albums; empty/error/loading states |
| Log album | Album ID; listened date (default today); optional rating, review, Shooting Star recording | Calls `log_album()`: upsert user-album and insert listen in one transaction |
| Log again | Album ID; date (default today); optional note | Calls `log_again()`: insert another listen; never duplicates collection |
| Edit album | Rating (0.5–5 in half steps, or unrated), review, one recording from tracklist | Update canonical user-album record; diary shows latest values |
| Diary | Year/month filters, sort, pagination | Dated rows for all listens, including same-day repeats |
| Remove / correct | Listen selection, updated date or delete; remove album action | Confirmation shows number of listens affected; consistent dependent data |

### Product rules (decided in v0.2)

- **Same-day repeats:** allowed. Multiple listens of one album on the same date each create a diary row.
- **Rating scale:** 0.5–5 in half-star steps. Unrated is stored as NULL; zero is not a valid rating.
- **Future dates:** blocked. `listened_on` must be on or before the user's current local date. Backdating is allowed.
- **Removing an album:** deletes its user-album record and all its listens, after a confirmation that states how many listens will be removed.
- **Visibility:** profiles are public by default with a private toggle. Private profiles hide collection, diary, ratings, and reviews from everyone but the owner.

## 6. Data model (proposed relational schema)

The database has two layers. The catalog layer (schema `catalog`) is a read-only copy of album data that only the sync worker writes to. The app layer holds user data and references catalog rows by our own numeric IDs.

### Catalog layer

| Entity | Important fields | Constraints / relationships |
|---|---|---|
| `catalog.artists` | id, mbid, name, sort_name, disambiguation | mbid unique |
| `catalog.albums` | id, mbid (release group), title, artist_credit, primary_type, secondary_types[], first_release_date, canonical_release_mbid, release_count, popularity, search_text, tracks_loaded_at, retired, updated_at | One row per release group; mbid unique; trigram index on search_text; index on popularity |
| `catalog.album_artists` | album_id, artist_id, position | PK(album_id, artist_id); supports multi-artist credits |
| `catalog.tracks` | album_id, disc_number, position, recording_mbid, title, length_ms | Tracklist of the canonical release; PK(album_id, disc_number, position); loaded on demand |
| `catalog.mbid_redirects` | old_mbid, new_mbid | Records upstream merges so references can be remapped |

### App layer

| Entity | Important fields | Constraints / relationships |
|---|---|---|
| `profiles` | user_id, username, display_name, bio, avatar_url, visibility (public \| private), created_at | Auth user 1:1 profile; username unique |
| `user_albums` | id, user_id, album_id → catalog.albums, rating, review, shooting_star_recording_mbid, shooting_star_title (copy), created_at, updated_at | UNIQUE(user_id, album_id); rating NULL or 0.5–5; Shooting Star must be a recording on the album's tracklist |
| `listens` | id, user_album_id, listened_on (date), note (optional), created_at | Many listens per user-album; ON DELETE CASCADE from user_albums; listened_on not in the future |
| `profile_favorites` | user_id, album_id → catalog.albums, slot (1–5) | PK(user_id, slot); UNIQUE(user_id, album_id); five distinct albums max |
| `follows` (Later) | follower_id, followee_id, created_at | One-way; PK(follower_id, followee_id); no self-follow. Created in the Social phase; reserved now so RLS policies anticipate it |

### ID rules

- Our own numeric IDs are the keys; MBIDs are stored in unique columns. When MusicBrainz merges duplicate albums, the old MBID redirects to the surviving one. The sync job reads redirects into `catalog.mbid_redirects` and updates or combines our catalog rows, so user logs stay attached.
- Never hard-delete a catalog row a user references. If an album disappears upstream, set `retired = true`, hide it from search, and keep it working for anyone who already logged it.
- Keep a copy of the Shooting Star title on `user_albums` so the pick always displays, even if upstream recording data changes.

**Derived values:** "date first added" is `MIN(listens.listened_on)` for the user-album rather than a stored column, so backdated listens can never put it out of sync. `created_at` remains as an audit timestamp.

**Queries:** Diary fetches listens for the current user, joins `user_albums` and `catalog.albums`, sorts by `listened_on DESC` then `created_at DESC` as a stable tie-breaker, and paginates by cursor. My Albums fetches `user_albums` once per album.

### Album identity and editions (resolved)

Users log the release group (the album as people think of it), not a specific pressing or edition. Each album stores one canonical release, taken from MusicBrainz's published canonical release mapping (CC0, updated twice a month), whose tracklist is shown. The Shooting Star references a MusicBrainz recording, which stays stable across editions, so a change of canonical release never invalidates a user's pick. Bonus tracks that exist only on deluxe editions are not selectable in MVP.

## 7. Album catalog and search

Search runs against a slim local copy of MusicBrainz rather than live API calls. This removes MusicBrainz's rate limit from the search path, keeps search working during upstream outages, and gives us control over ranking.

### Approach comparison

| Option | Pros | Cons |
|---|---|---|
| Live API on every search | No storage or sync job | ~1 request/second limit, noisy results, slow, fails when MusicBrainz is down |
| Full MusicBrainz mirror | Complete data, hourly replication possible | Tens of GB, heavy to host and maintain, mostly unused data |
| **Slim local index (chosen)** | Millisecond search, no rate limits, ranking control, modest size | Needs a sync job and a popularity signal; brand-new albums need a fallback |

### Sync pipeline

- **Where it runs:** a small scheduled worker on a container service or VM, not on Vercel, because imports exceed serverless time limits.
- **Initial load:** download MusicBrainz JSON dumps (release-group, artist; mostly CC0) and stream-parse them line by line.
- **Filter:** keep release groups with primary type Album or EP and at least one official release. Live albums, compilations and soundtracks stay in, flagged through `secondary_types` so they rank lower.
- **Normalize:** build `search_text` as lowercase, unaccented "title artist" with a leading "the" removed.
- **Load safely:** bulk-load into staging tables with COPY, then upsert into the catalog in one transaction so search never sees a half-loaded state.
- **Canonical releases:** load MusicBrainz's canonical release mapping into `canonical_release_mbid`.
- **Merges:** load MBID redirects and remap or combine affected catalog rows.
- **Refresh:** weekly full refresh at launch. Hourly incremental JSON dumps are available later if same-day freshness is needed.

### Search and ranking

Search is one Postgres function, `search_albums(q, lim)`, called over Supabase RPC by both web and mobile. It uses the `pg_trgm` and `unaccent` extensions for typo-tolerant matching on `search_text` and excludes retired albums. Results are ordered by:

- **Text match** (word similarity between the query and title + artist): primary signal.
- **Popularity** (log-scaled score): so the original album beats tributes and covers with similar names.
- **Type boost:** studio albums above live albums, compilations and EPs.

Initial weights (similarity × 1.0, popularity × 0.15, type × 0.1) are starting points to tune during the Phase 1 spike.

**Popularity score** is recomputed weekly from: `release_count` (popular albums have many editions; free from the dump); ListenBrainz listen and listener counts via its batch popularity endpoint, refreshed for the top few hundred thousand albums; and our own users' log counts, which become the strongest signal as the app grows.

**Fallback:** when the best local score is weak or there are no results (usually a brand-new release), the server makes one rate-limited live MusicBrainz search and inserts the results into the catalog, so the next search finds them locally.

### Tracklists and artwork

- **Tracklists load on demand:** when an album page opens and `tracks_loaded_at` is null, the server fetches the canonical release's recordings from the MusicBrainz API through the rate-limited adapter, stores them in `catalog.tracks`, and stamps `tracks_loaded_at`.
- **Pre-warming:** a background job loads tracklists for the most popular albums (e.g., top 50k) so common album pages are instant.
- **Artwork:** Cover Art Archive images are addressed directly by release-group MBID, so no files are stored and no lookup call is needed. Serve through Next.js image optimization or a CDN, with a fallback cover for missing art.

**Size and hosting:** the filtered catalog plus indexes is expected to be a few GB, likely more than Supabase's free tier allows. Budget for a paid plan when the full import lands, and confirm current plan limits at that time.

## 8. External services and integrations

| Service / option | Purpose | Notes / risk |
|---|---|---|
| MusicBrainz JSON dumps | Bulk album and artist data for the local catalog | Mostly CC0; weekly refresh; attribution recommended |
| MusicBrainz API | On-demand tracklists and the live search fallback | About 1 request/second and a descriptive User-Agent required; all calls go through one rate-limited server-side adapter |
| MusicBrainz canonical data | Canonical release per release group | CC0; published twice a month |
| ListenBrainz API | Listen counts for the popularity score | Batch endpoint; refresh weekly for top albums only |
| Cover Art Archive | Album artwork by release group | Coverage varies; fallback artwork; respect usage terms and attribution |
| Supabase Auth + Postgres | Accounts, catalog and app data, RLS, Postgres functions (RPC) | Business logic and search live here so web and mobile share them; likely paid plan for catalog size |
| Supabase Storage | User avatar uploads | Limit size/type; moderation and storage costs |
| Worker host (TBD) | Scheduled sync and pre-warming jobs | Any small container or VM service |
| Vercel or similar | Next.js deployment, previews, hosting, MusicBrainz adapter routes | Hosting choice not yet finalized |
| Spotify | "Open in Spotify" links, embed player for Shooting Star previews, history import from users' account data export | No Web API dependency. Since 2025–26, new development-mode apps need the owner on Premium and are limited to 5 users; extended access requires a registered business with 250k monthly active users |
| Apple Music / Deezer (optional) | Secondary search or higher-quality artwork if the spike shows a need | Apple needs the paid Apple Developer Program (also needed for iOS); review Deezer terms before commercial use |
| Last.fm (Later) | Listening history import | Free API key; for import only, not the catalog |

No music streaming or copyrighted audio hosting is planned. Album metadata and artwork require source attribution and compliance with provider terms. Never expose privileged API keys in client code.

## 9. Architecture and implementation approach

- **Frontend:** Next.js + TypeScript + Tailwind CSS; responsive layouts and accessible form controls.
- **Business logic in the database:** core writes are Postgres functions called via Supabase RPC: `log_album(album_id, listened_on, rating, review, shooting_star_recording_mbid)`, `log_again(album_id, listened_on, note)`, `update_user_album(...)`, `remove_user_album(album_id)`, `set_favorites(album_ids[])`. Each runs in a single transaction and validates inputs.
- **Search:** `search_albums()` runs in Postgres against the local catalog (Section 7).
- **Authorization:** row-level security on every user-owned table, written to respect profile visibility and to extend cleanly to follows. Catalog tables are readable by all clients and writable only by the sync worker's service role.
- **MusicBrainz adapter:** the only app server code outside the database. Next.js route handlers wrap on-demand tracklist fetches and the live search fallback with a shared rate limiter and User-Agent, writing results into the catalog.
- **Sync worker:** separate scheduled process for dump imports, canonical mapping, redirects, popularity refresh and tracklist pre-warming.
- **Mobile-ready:** logic and search sit in Postgres functions + RLS, and the adapter sits behind HTTP endpoints, so a future React Native/Expo app can use the same Supabase client and endpoints. Generate TypeScript types from the schema and share them.
- **Concurrency:** `log_album` uses `INSERT … ON CONFLICT (user_id, album_id)` so double taps never create duplicate user-albums.
- **Dates:** `listened_on` is a date (user-selected calendar day); `created_at` is a timestamp. Future-date check uses the client's local date passed to the function.
- **Observability:** error reporting, request logs without sensitive data, sync job success/duration, search latency, fallback rate, MusicBrainz error rates.

## 10. Nonfunctional requirements and edge cases

- **Security:** authentication, authorization on every mutation, RLS, passwords handled by the auth provider, rate limiting, secure uploads.
- **Reliability:** idempotent logging under concurrent requests; search keeps working from the local catalog during MusicBrainz outages; retry API failures with backoff; failed syncs leave the previous catalog intact; fallback artwork.
- **Usability:** log in a few taps; every review field truly optional; keyboard and screen-reader support.
- **Performance:** search results in well under 200 ms; cursor pagination for diary and collection; indexes on `listens(user_album_id, listened_on)`, `user_albums(user_id, album_id)`, `catalog.albums(mbid)`, trigram index on `catalog.albums(search_text)`, `catalog.albums(popularity)`.
- **Privacy:** public-by-default profiles with private toggle; account deletion and data export (JSON/CSV of collection and diary).
- **Edge cases:** duplicate album titles, deluxe editions, missing tracks, changed tracklists, upstream album merges or deletions, brand-new releases not yet in the catalog, same-day repeat listens, backdated entries, deleting a listened album, an album that is also a profile favorite being removed (clear the slot).

## 11. Success metrics

| Metric | What it tells us | Initial target |
|---|---|---|
| Logs per active user per week | Is the diary becoming a habit? | ≥ 2 |
| Share of logs with a Shooting Star | Is the signature feature landing? | ≥ 40% |
| Share of logs with a rating | Are users engaging beyond a bare log? | ≥ 60% |
| Repeat-listen share (Log Again) | Is the diary used over time, not just as a catalog? | ≥ 15% of listens |
| Week-4 retention | Do new users come back? | ≥ 25% |
| Search-to-log success | Can users find the album they want? | ≥ 85% of searches end in a log or album view |
| Correct album ranked first | Is search ranking good enough? | ≥ 90% on the 50-query test set |

Targets are placeholders to revisit after the first cohort of users.

## 12. Milestones and acceptance criteria

| Phase | Deliverables | Done when |
|---|---|---|
| 1 — Foundation + search spike | Project scaffold, auth, profile, app schema, RLS; import a slice of the MusicBrainz dump, write `search_albums()`, tune ranking against 50 real searches | User can register, sign in, edit profile; the correct album ranks first for ≥ 90% of test searches, or the spike recommends a secondary search source |
| 2 — Catalog | Full sync worker, canonical release mapping, MBID redirects, on-demand tracklists, artwork, live fallback, weekly schedule | User can reliably find and inspect an album, including new releases; a failed sync leaves search working |
| 3 — Core logging | `log_album` function; rating, review, Shooting Star; first listen; Shooting Star display | Single action saves collection record and diary date; Shooting Star visible on album page and diary |
| 4 — Diary | Chronological timeline, Log Again with note, filters, edit/delete listens, remove album | Repeat album appears multiple times in diary, once in collection |
| 5 — Polish & launch | Top five favorites, Shooting Stars view, empty states, responsive design, privacy toggle, popularity from ListenBrainz, tracklist pre-warming, validation, QA, deploy | Core workflows work on desktop and mobile web for multiple accounts; private profiles are hidden |
| Post-MVP | Discovery, streaming links and embeds, follows and followed users' reviews, history import, analytics, native mobile app | Prioritized after launch metrics are in |

## 13. Out of scope for MVP

Native iOS/Android app; any Spotify Web API integration; automatic Spotify/Apple Music listening synchronization; listening history import; audio playback beyond optional embeds; following, comments, likes, feed; AI recommendations; community rankings; collaborative lists; paid subscriptions; advanced statistics.

## 14. Decisions confirmed vs. unresolved

### Confirmed

- Web-first and album-first; personal diary before social features; native mobile app later on the same backend.
- Profiles with top five favorite albums.
- One permanent user-album with rating, review, and an optional Shooting Star; optional notes on individual listens.
- Automatic diary entry when logging; repeat and same-day listens all appear in the timeline.
- Social model is one-way follows.
- Albums are MusicBrainz release groups with a canonical release from MusicBrainz's mapping; Shooting Star is a recording MBID.
- Local slim catalog for search, synced weekly from MusicBrainz dumps, with on-demand tracklists and a live fallback.
- Our own numeric IDs as keys, MBIDs in unique columns, merge redirects handled, referenced albums never hard-deleted.
- Core logic and search in Postgres functions + RLS; MusicBrainz API only through a rate-limited server-side adapter.
- Spotify used only for links, embeds and history-file import; no Spotify Web API dependency.
- Rating 0.5–5 or unrated; no future dates; album removal deletes its listens after confirmation; profiles public by default with private toggle.

### Still open

- Final ranking weights, and whether Apple Music or Deezer search is needed at all (answered by the Phase 1 spike).
- Worker host and Supabase plan size once the full catalog is imported.
- Whether Discovery (browsing other public profiles) ships in MVP or immediately after.
- Whether reviews get their own visibility setting separate from the profile.
- App name, visual identity, and final hosting provider.

---

*Document status: planning draft, not a final implementation contract. API quotas, terms, pricing, and provider suitability should be verified at integration time.*
