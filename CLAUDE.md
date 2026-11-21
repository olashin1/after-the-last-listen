# Music Album Diary

Letterboxd-style album diary. The full spec is in `docs/prd.md`. Read the relevant sections before planning any feature, and treat its product rules (Section 5) and data model (Section 6) as requirements. Decisions made since the PRD, and why, are in `docs/decisions.md`; progress is in `docs/progress.md`.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Auth, Postgres, Storage, RPC
- Sync worker: a separate Node/TypeScript package (Phase 2)

## Repo layout

- `apps/web`: Next.js app
- `packages/worker`: MusicBrainz tools — catalog import, canonical releases, catalog snapshots, search eval (the Phase 2 sync worker grows from here). Runs TypeScript directly with `node --experimental-strip-types`: imports use `.ts` extensions, and only erasable syntax is allowed (no enums or namespaces).
- `packages/types`: TypeScript types generated from the database schema (`public` and `catalog`)
- `supabase/`: migrations, seed data (`seed.sql`: local test accounts), SQL tests
- `docs/`: PRD, decisions, progress, testing guide (`testing.md`), search spike notes (`search-spike.md`)
- `.cache/` (gitignored): downloaded MusicBrainz dumps and catalog snapshots

## Architecture rules (do not break these)

- Core writes go through Postgres functions called by RPC (`log_album`, `log_again`, `update_user_album`, `remove_user_album`, `set_favorites`, `update_profile`, `set_avatar`, `remove_avatar`). No business logic in React components or route handlers.
- Private content (collection, diary, ratings, reviews) is gated in RLS by `can_view_user_content(owner)`. Profile cards (including the avatar) are always public.
- Search is the Postgres function `search_albums(q, lim)` against the local `catalog` schema. It's `security definer` and calls the tunable core `catalog.search_albums_weighted()`, which clients must not be able to execute.
- Every user-owned table has RLS enabled. The `catalog` schema is readable by everyone and writable only by the service role. It isn't exposed in the Data API; clients reach it through `public` functions (`search_albums`, `get_album`, `get_album_tracks`).
- MusicBrainz API calls go only through the shared rate-limited server adapter, `apps/web/lib/musicbrainz.ts` (requests 1.1 s apart, User-Agent `AfterTheLastListen/0.1 ( https://github.com/olashin1/after-the-last-listen )`). Dump downloads aren't API calls but send the same User-Agent.
- The service role key and other secrets never reach client code or get committed. Use `.env.local`, and keep `.env.example` up to date. In the web app the key is `SUPABASE_SECRET_KEY`, read only by the server-only `lib/supabase/admin.ts`, and used only for service-role catalog writes (`set_album_tracks`).
- Our own numeric IDs are primary keys; MBIDs live in unique columns. Never hard-delete a catalog artist or album; set `retired = true` instead (enforced by grants and triggers). `catalog.tracks` and `catalog.album_artists` are replaceable caches of upstream data and may be rewritten.
- Never store MusicBrainz annotation, genres, ratings or tags: they're CC BY-NC-SA, while the rest of the data is CC0.
- Debug-only pages (e.g. `/search`) check `debugToolsEnabled()` (`lib/debug.ts`, `DEBUG_TOOLS=true` in `apps/web/.env.local`) and return 404 otherwise. Never enable it in a deployed environment.

## Database workflow

- Every schema change is a new migration in `supabase/migrations/`. Never edit an applied migration, and never change the database by hand.
- While developing, apply a new migration with `pnpm supabase migration up` (keeps local data), run the SQL tests, then regenerate types into `packages/types`.
- Before committing or merging work that adds migrations: run `pnpm db:reset` (rebuilds from the migrations alone, the way hosted Supabase and fresh clones will) and `pnpm check`. Then run `pnpm catalog:restore` to bring back the catalog. Seeded test accounts come back automatically (`supabase/seed.sql`).
- Migrations run as a non-superuser on hosted Supabase and with `migration up`. Load an extension's library before a function's `SET` clause uses its settings (see `20261121120000_search_threshold.sql`).
- Every Postgres function and RLS policy gets tests, including a test that one user cannot read or change another user's private data.
- SQL test fixtures use invented names and fake MBIDs, so tests pass on an empty catalog and on a full import. Never use real album, artist or MBID values in fixtures.

## Commands

Run from the repo root. The Supabase CLI is a devDependency, so call it as `pnpm supabase …`, not bare `supabase`. If `pnpm` isn't found in PowerShell, run `$env:PATH = "$env:APPDATA\npm;$env:PATH"` first.

- Start / stop local database: `pnpm db:start` / `pnpm db:stop` (needs Docker)
- Reset database and apply migrations: `pnpm db:reset`
- Apply new migrations without losing data: `pnpm supabase migration up`
- SQL tests (pgTAP, `supabase/tests`): `pnpm db:test`
- Generate types: `pnpm db:types` (writes `packages/types/database.ts`)
- Web dev server: `pnpm dev`
- Lint / typecheck: `pnpm lint` / `pnpm typecheck` (all workspaces)
- Unit tests (Vitest): `pnpm test` (all workspaces)
- Everything before saying a task is done: `pnpm check`
- Catalog: `pnpm catalog:import` (MusicBrainz release groups, ~10 min), then `pnpm catalog:canonical` (canonical releases, ~8 min). `pnpm catalog:snapshot` (~40 s) / `pnpm catalog:restore` (~6 min) save and restore the imported catalog around resets. Details: `packages/worker/README.md`.
- Search accuracy: `pnpm search:eval` (test searches in `packages/worker/search-eval/queries.json`). In PowerShell, quote weights: `--weights "1,0.15,0.1"`.

Local test accounts (seeded on every reset): `alice@demo.test` / `password123` (public) and `bob@demo.test` / `password123` (private). See `docs/testing.md`.

Next.js is v16: auth session refresh is in `apps/web/proxy.ts` (formerly `middleware.ts`), and the Next docs live in `apps/web/node_modules/next/dist/docs/` (see `apps/web/AGENTS.md`, which `next dev` maintains).

## Local environment notes

- Windows. Archives are streamed with the system `tar`; the canonical dump is `.tar.zst`, which Windows' built-in `tar.exe` reads but Git Bash's GNU tar doesn't (no `zstd`).
- Memory is tight: the dev server can get stopped for low memory, and imports run slower. Don't start long background jobs without saying so.
- `pnpm db:reset` empties the catalog and local accounts. Say so before running it.

## How to work

- Make small, focused changes. Run typecheck, lint and tests before saying a task is done.
- If the PRD is ambiguous or seems wrong, ask instead of guessing, and note open decisions in `docs/decisions.md`.
- Don't add dependencies without saying why.
- Don't rely on memory for external API limits or terms; check the current docs.
- Create docs/progress.md tracking each PRD phase as a checklist. Update it at the end of every task.
