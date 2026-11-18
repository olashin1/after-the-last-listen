# SQL tests (pgTAP)

Run with `pnpm db:test` (`supabase test db`). It needs the local stack running (`pnpm db:start`).

- The CLI enables pgTAP for the run and drops it afterwards, so no migration installs it.
- Files end in `.sql` (we use `NNN_name.test.sql`). Every file wraps its work in `begin; … rollback;` so tests leave no data behind.
- **One file per Postgres function or RLS-protected table.** Each one includes a test that a user cannot read or change another user's private data (CLAUDE.md).
- Act as a user inside a test:

  ```sql
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
  -- … assertions …
  reset role;
  ```

  Also test the `anon` role for anything public (e.g. public profiles, the `catalog` schema).
