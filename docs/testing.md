# Running tests

Run everything from the repo root (`C:\_repos\afterthelastlisten`).

## Before you start

- Docker Desktop must be running.
- The local database must be up: `pnpm db:start`.
- If `pnpm` isn't found, it's installed but not on your PATH. In PowerShell, run this once per terminal:

  ```
  $env:PATH = "$env:APPDATA\npm;$env:PATH"
  ```

  Or add `%APPDATA%\npm` to your PATH permanently.

## Commands

| What | Command |
|---|---|
| Everything (typecheck, lint, unit tests, SQL tests). Run before calling a task done. | `pnpm check` |
| All SQL tests (pgTAP, `supabase/tests`) | `pnpm db:test` |
| One SQL test file | `pnpm supabase test db supabase/tests/021_catalog_search_key.test.sql` |
| Several SQL test files | `pnpm supabase test db supabase/tests/022_catalog_artists.test.sql supabase/tests/023_catalog_albums.test.sql` |
| Unit tests only (Vitest, web + worker) | `pnpm test` |

The SQL test files are in `supabase/tests/`, one per table or function, named after what they cover. How to write one: `supabase/tests/README.md`.

## After changing a migration

While developing, apply it without losing local data, then test:

```
pnpm supabase migration up
pnpm db:test
pnpm db:types
```

Before committing or merging, rebuild from the migrations alone (the way hosted Supabase and fresh clones will) and run everything. **`pnpm db:reset` wipes all local data**, so restore the catalog afterwards:

```
pnpm db:reset
pnpm check
pnpm catalog:restore
```

## Test accounts

`pnpm db:reset` creates two confirmed accounts (`supabase/seed.sql`), so there's no sign-up or Mailpit step:

| Email | Password | Username | Profile |
|---|---|---|---|
| `alice@demo.test` | `password123` | `demo_alice` | public |
| `bob@demo.test` | `password123` | `demo_bob` | private |
| `test@gmail.com` | `1234` | `tester` | public (your own account for manual testing; the password is under the 8-character minimum, so it only works because it's seeded) |

Local only: they're never created on hosted Supabase.

## Logging (manual check)

Sign in as `test@gmail.com` (or a demo account) with `pnpm dev` running:

1. `/albums` shows "No logs yet" for a new account.
2. Click the purple **Log +** in the header, search, pick an album, set a rating, a review and a Shooting Star, and save. The album appears in My Albums, the diary and on its page, with the star highlighted in the tracklist.
3. On that album page, **Log again +** opens the form prefilled. Change the date and save: the diary gets a second row, and My Albums still shows the album once.
4. **Edit** changes rating, review or star without adding a diary row.
5. Signed out, `/u/demo_bob/albums` says the profile is private.

## Search accuracy (real catalog data)

The SQL tests use invented albums, so they pass on an empty or a full catalog. Measuring search accuracy needs the real MusicBrainz catalog: import it with `pnpm catalog:import`, then run `pnpm search:eval`. Options, timings and the test-search file are in `packages/worker/README.md`. After a `pnpm db:reset`, `pnpm catalog:restore` brings the catalog back from a snapshot in a few minutes.
