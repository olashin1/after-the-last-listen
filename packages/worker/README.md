# @atll/worker

MusicBrainz catalog tools. Today: the Phase 1 one-off import and the search eval. In Phase 2 this becomes the scheduled sync worker (canonical release mapping, redirects, popularity).

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

## Snapshot and restore

A full import takes about 25 minutes (catalog plus canonical releases); restoring a snapshot is much faster.

```
pnpm catalog:snapshot   # after an import: save the catalog to .cache/catalog/catalog.dump
pnpm catalog:restore    # after pnpm db:reset: load it back into the empty catalog
```

- Runs `pg_dump` / `pg_restore` inside the local Supabase database container, so Docker must be running.
- Restore only works on an empty catalog, and only if the catalog tables' columns are the same as when the snapshot was taken. Migrations that don't touch the catalog don't matter; after one that changes catalog tables, re-import and take a new snapshot.
- Tracklists already loaded by album pages are included, so they don't need fetching from MusicBrainz again.

## Search eval

```
pnpm search:eval                        # queries.json through public.search_albums
pnpm search:eval --weights 1,0.3,0.1    # try other weights (similarity,popularity,type)
pnpm search:eval --weights 1,0.15,0.1 --threshold 0.25
pnpm search:eval --verbose              # show the top 5 for every query
```

Test searches live in `search-eval/queries.json`. Each entry has `query`, `expected` (readable title and artist), `expected_mbid`, `category` and `author`. Entries without a query or MBID are skipped.

## Tests

`pnpm --filter @atll/worker test` (Vitest): dump mapping, COPY encoding, eval metrics.
