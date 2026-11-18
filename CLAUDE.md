# Music Album Diary

Letterboxd-style album diary. The full spec is in `docs/prd.md`. Read the relevant sections before planning any feature, and treat its product rules (Section 5) and data model (Section 6) as requirements.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Auth, Postgres, Storage, RPC
- Sync worker: a separate Node/TypeScript package (Phase 2)

## Repo layout

- `apps/web`: Next.js app
- `packages/worker`: MusicBrainz sync worker
- `packages/types`: TypeScript types generated from the database schema
- `supabase/`: migrations, seed data, SQL tests
- `docs/`: PRD and design notes

## Architecture rules (do not break these)

- Core writes go through Postgres functions called by RPC (`log_album`, `log_again`, `update_user_album`, `remove_user_album`, `set_favorites`). No business logic in React components or route handlers.
- Search is the Postgres function `search_albums(q, lim)` against the local `catalog` schema.
- Every user-owned table has RLS enabled. The `catalog` schema is readable by everyone and writable only by the service role.
- MusicBrainz API calls go only through the shared rate-limited server adapter (about 1 request/second, descriptive User-Agent).
- The service role key and other secrets never reach client code or get committed. Use `.env.local`, and keep `.env.example` up to date.
- Our own numeric IDs are primary keys; MBIDs live in unique columns. Never hard-delete a catalog row; set `retired = true` instead.

## Database workflow

- Every schema change is a new migration in `supabase/migrations/`. Never edit an applied migration, and never change the database by hand.
- After a migration: run `supabase db reset`, run the SQL tests, then regenerate types into `packages/types`.
- Every Postgres function and RLS policy gets tests, including a test that one user cannot read or change another user's private data.

## Commands

(Fill these in once the scaffold exists.)

- Start local database: `supabase start`
- Reset database and apply migrations: `supabase db reset`
- SQL tests: `supabase test db`
- Generate types: `supabase gen types typescript --local > packages/types/database.ts`
- Web dev server:
- Lint / typecheck / unit tests:

## How to work

- Make small, focused changes. Run typecheck, lint and tests before saying a task is done.
- If the PRD is ambiguous or seems wrong, ask instead of guessing, and note open decisions in `docs/decisions.md`.
- Don't add dependencies without saying why.
- Don't rely on memory for external API limits or terms; check the current docs.
