# @atll/worker

MusicBrainz catalog tools: the weekly catalog sync, the one-off import and canonical loader it's built from, catalog snapshots and the search eval. MusicBrainz API calls go through the shared adapter in `packages/musicbrainz`.

Runs TypeScript directly with `node --experimental-strip-types` (Node 22.6+), so imports use `.ts` extensions and only erasable syntax is allowed (no enums or namespaces).

## Setup

```
cp packages/worker/.env.example packages/worker/.env.local
pnpm db:start
```

`DATABASE_URL` points at the local Supabase database. The scripts refuse any other host unless you pass `--allow-remote`.

## Import the catalog

Run from the repo root:

```
pnpm catalog:import                 # download (or reuse) the latest dump and load it
pnpm catalog:import --dry-run       # stream and count only, no database writes
pnpm catalog:import --limit 50000   # stop after 50k albums (quick testing)
pnpm catalog:import --file <path>   # use a release-group.tar.xz you already have
pnpm catalog:import --date 20261118-001001   # a specific dump
```

- The dump (about 1.3 GB) is cached in `.cache/musicbrainz/<date>/` (gitignored) and checked against the published SHA-256.
- Only Album and EP release groups are kept. Genres, tags, ratings and annotations are never stored (they're under a non-commercial license).
- Everything loads in one transaction, and re-running the same dump changes nothing.
- `pnpm db:reset` empties the catalog. Restore it from a snapshot (below) instead of re-importing.

## Canonical releases (which edition's tracklist an album shows)

Run after the import:

```
pnpm catalog:canonical                     # download (or reuse) the latest canonical dump and load it
pnpm catalog:canonical --folder musicbrainz-canonical-dump-20261117-080003
```

- The canonical data dump (about 2.4 GB `.tar.zst`, CC0) is cached in `.cache/musicbrainz/canonical/` and checked against its SHA-256.
- It sets `catalog.albums.canonical_release_mbid`. Album pages then fetch that release's tracklist from the MusicBrainz API on first view.
- Your `tar` must read zstd. Windows' built-in `tar.exe` (used from PowerShell) does; Git Bash's GNU tar needs `zstd` installed.

## Weekly sync

`pnpm catalog:sync` is the one command the schedule runs. It works on a full catalog as well as an empty one:

```
pnpm catalog:sync                       # latest release-group + canonical dumps, then merge lookups
pnpm catalog:sync --max-lookups 200     # cap the MusicBrainz API lookups (default 1500, 2 s apart)
pnpm catalog:sync --skip-canonical      # release groups and lookups only
pnpm catalog:sync --file <path>         # an already-downloaded release-group.tar.xz
```

1. **Release groups:** upserts the dump the same way as `catalog:import`. It also un-retires albums that are back, and marks live-search albums as confirmed once the dump has them. Active albums missing from the dump are queued in `catalog.sync_vanished`.
   - **Safety guard:** if the dump has fewer than 95% of the active albums, or more than 2% of them vanished, the whole step rolls back and the run fails. A truncated download can't retire the catalog.
2. **Canonical releases:** same as `catalog:canonical`. It does nothing when the canonical dump hasn't changed.
3. **Vanished albums:** each one is looked up in the MusicBrainz API (`release-group/<mbid>`):
   - A different MBID back means a merge: `catalog.apply_album_redirect()`.
   - A 404, or a type that's no longer Album or EP, means it's retired: `catalog.retire_album()`.
   - Anything else is kept.
   - Albums left over (the cap, or API errors) stay searchable and wait for the next run.

Each step commits on its own, so a failure at any point leaves the previous catalog searchable. Every run is recorded in `catalog.sync_runs` (status, dumps, counts, error):

```
select id, status, started_at, finished_at, dump_date, error, counts->'vanished' from catalog.sync_runs order by id desc limit 5;
```

Only one sync runs at a time (an advisory lock). A run left `running` by a crash is marked `failed` by the next one. After a successful run, older dumps in `.cache/musicbrainz` are deleted.

### Scheduled sync (GitHub Actions)

`.github/workflows/catalog-sync.yml` runs the sync every Sunday at 06:00 UTC, and on demand from the Actions tab. It does nothing until the repository secret `CATALOG_DATABASE_URL` is set. To turn it on for a hosted project:

- Use the Supabase **session pooler** connection string. GitHub runners are IPv4-only, the direct connection is IPv6, and the transaction pooler can't hold the advisory lock.
- Connect as a role that owns the catalog tables, the same as the local `postgres` user.
- The run downloads about 3.7 GB of dumps. It needs well under the runner's 150-minute limit.

## Snapshot and restore

A full import takes 20–25 minutes (catalog plus canonical releases). A snapshot takes about 40 seconds (293 MB) and restores in about 6 minutes.

```
pnpm catalog:snapshot   # after an import: save the catalog to .cache/catalog/catalog.dump
pnpm catalog:restore    # after pnpm db:reset: load it back into the empty catalog
```

- Runs `pg_dump` / `pg_restore` inside the local Supabase database container, so Docker must be running.
- Restore only works on an empty catalog, and only if the catalog tables' columns are the same as when the snapshot was taken. Migrations that don't touch the catalog don't matter; after one that changes catalog tables, re-import and take a new snapshot.
- Tracklists already loaded by album pages are included, so they don't need fetching from MusicBrainz again.
- `pg_dump` warns about a circular foreign key on `albums` (`merged_into_id` points at another album). That's expected: the reference is checked at commit, and the restore runs in one transaction.

## Search eval

```
pnpm search:eval                        # queries.json through public.search_albums
pnpm search:eval --weights 1,0.3,0.1    # try other weights (similarity,popularity,type)
pnpm search:eval --weights 1,0.15,0.1 --threshold 0.25
pnpm search:eval --verbose              # show the top 5 for every query
```

Test searches live in `search-eval/queries.json`. Each entry has `query`, `expected` (readable title and artist), `expected_mbid`, `category` and `author`. Entries without a query or MBID are skipped.

## Tests

`pnpm --filter @atll/worker test` (Vitest): COPY encoding, the dump guard, lookup classification, cache pruning and eval metrics. The release-group mapper's tests are in `packages/musicbrainz`.
