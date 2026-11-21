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

Apply it, then test. **`pnpm db:reset` wipes all local data**, including accounts you made while testing and the imported catalog.

```
pnpm db:reset
pnpm db:test
pnpm db:types
```

## Search accuracy (real catalog data)

The SQL tests use invented albums, so they pass on an empty or a full catalog. Measuring search accuracy needs the real MusicBrainz catalog: import it with `pnpm catalog:import`, then run `pnpm search:eval`. Options, timings and the test-search file are in `packages/worker/README.md`. Re-import (`pnpm catalog:import`, then `pnpm catalog:canonical`) after every `pnpm db:reset`.
