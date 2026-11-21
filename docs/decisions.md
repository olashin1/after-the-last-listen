# Decisions

Open and settled decisions that aren't in `docs/prd.md`. Newest first.

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
- **Test set (decided with the user):** 50 searches in `packages/worker/search-eval/queries.json`, 25 written by the user and 25 edge cases by Claude. `pnpm search:eval` reports top-1 (the PRD target), top-5, MRR and latency, and lists every miss.
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
