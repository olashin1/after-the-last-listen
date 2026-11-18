# Decisions

Open and settled decisions that aren't in `docs/prd.md`. Newest first.

## 2026-11-17: Phase 1 scaffold

- **Moved the create-next-app project from the repo root into `apps/web`** using `git mv`, to keep history and the pinned Next 16.4.6 / Tailwind 4.3.3 versions. The root `AGENTS.md` was removed: `next dev` now maintains `apps/web/AGENTS.md`, and the root copy pointed at a `node_modules/next` that pnpm does not hoist to the root.
- **Supabase CLI is a root devDependency** (`supabase` on npm), run as `pnpm supabase …`. It pins the CLI version and avoids a global install.
- **pgTAP is not installed by migration.** `supabase test db` enables pgTAP for the run and drops it afterwards (Supabase CLI docs, checked 2026-11-17). So there are no migrations yet; the first one will be the app schema.
- **No unit-test runner yet.** There's no TypeScript logic to test. Add one (likely Vitest) with the first TS module that has logic, such as the MusicBrainz adapter.
- **Auth session refresh lives in `apps/web/proxy.ts`** (Next 16 renamed `middleware.ts` to `proxy.ts`) and uses `getClaims()`, following the current Supabase SSR guide. It doesn't protect any routes yet.
- **Env var names:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key, not the legacy anon key).
