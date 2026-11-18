# Decisions

Open and settled decisions that aren't in `docs/prd.md`. Newest first.

## 2026-11-17: Profiles and auth

- **Private profiles keep their card visible.** Anyone can see a private user's username, display name, bio and avatar. Their collection, diary, ratings and reviews are owner-only. This follows PRD §5 ("private profiles hide collection, diary, ratings, and reviews") and keeps usernames findable for follows later. Future tables enforce it through `can_view_user_content(owner)` in their RLS policies; extend that function for follows in the Social phase.
- **Profile edits go through an `update_profile()` RPC**, the same as the core writes. Clients have SELECT only on `profiles`; profile rows are created by the `handle_new_user()` trigger on `auth.users`.
- **Username rules:** 3–20 characters of `a–z`, `0–9`, `_`. Stored lowercase, unique regardless of case, and changeable. A released username can be taken by someone else straight away.
- **Field limits** (not in the PRD): display name 1–50 characters, bio 1–300. Empty strings are stored as NULL.
- **Avatar upload is deferred** to its own task (Storage bucket, per-user policies, size/type limits, UI). `profiles.avatar_url` exists but nothing sets it yet.
- **Auth settings:** email confirmation on (matches hosted Supabase), minimum password length 8. Email links use `token_hash` and the `/auth/confirm` route, with templates in `supabase/templates/`. **The hosted project needs the same settings and templates set in the dashboard.**
- **A sign-up rejected by the trigger reaches supabase-js as a 500 with no error code** ("Database error saving new user"). Auth hides the trigger's message when the API version header that supabase-js sends is present. So the sign-up action pre-checks with `check_username()`, and checks again after a failed sign-up to explain a lost race.

## 2026-11-17: Phase 1 scaffold

- **Moved the create-next-app project from the repo root into `apps/web`** using `git mv`, to keep history and the pinned Next 16.4.6 / Tailwind 4.3.3 versions. The root `AGENTS.md` was removed: `next dev` now maintains `apps/web/AGENTS.md`, and the root copy pointed at a `node_modules/next` that pnpm does not hoist to the root.
- **Supabase CLI is a root devDependency** (`supabase` on npm), run as `pnpm supabase …`. It pins the CLI version and avoids a global install.
- **pgTAP is not installed by migration.** `supabase test db` enables pgTAP for the run and drops it afterwards (Supabase CLI docs, checked 2026-11-17). So there are no migrations yet; the first one will be the app schema.
- **No unit-test runner yet.** There's no TypeScript logic to test. Add one (likely Vitest) with the first TS module that has logic, such as the MusicBrainz adapter.
- **Auth session refresh lives in `apps/web/proxy.ts`** (Next 16 renamed `middleware.ts` to `proxy.ts`) and uses `getClaims()`, following the current Supabase SSR guide. (Since the profiles/auth task it also redirects signed-out visitors away from `/settings` and `/reset-password`.)
- **Env var names:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key, not the legacy anon key).
