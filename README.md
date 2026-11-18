# After the Last Listen

A Letterboxd-style album diary. Spec: [`docs/prd.md`](docs/prd.md). Working rules: [`CLAUDE.md`](CLAUDE.md).

## Setup

Requires Node 22+, pnpm, and Docker (for local Supabase).

```sh
pnpm install
pnpm db:start                                  # local Supabase in Docker
cp apps/web/.env.example apps/web/.env.local   # fill from `pnpm supabase status`
pnpm dev                                       # http://localhost:3000
```

## Layout

- `apps/web`: Next.js app
- `packages/types`: generated database types (`pnpm db:types`)
- `packages/worker`: MusicBrainz sync worker (Phase 2)
- `supabase/`: config, migrations, seed, pgTAP tests
