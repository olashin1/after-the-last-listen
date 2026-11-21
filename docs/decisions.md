# Decisions

Open and settled decisions that aren't in `docs/prd.md`. Newest first.

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
