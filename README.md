# After the Last Listen

An album diary. Spec: [`docs/prd.md`](docs/prd.md). Working rules: [`CLAUDE.md`](CLAUDE.md).

## Setup

Requires Node 22+, pnpm, and Docker (for local Supabase).

```sh
pnpm install
pnpm db:start                                  # local Supabase in Docker
cp apps/web/.env.example apps/web/.env.local   # fill from `pnpm supabase status`
pnpm dev                                       # http://localhost:3000
```

Locally, Auth emails (sign-up confirmation, password reset) aren't sent. They're caught by Mailpit at http://127.0.0.1:54324. Use `localhost:3000` (not `127.0.0.1:3000`) so the email links and your session cookie are on the same host.

## Layout

- `apps/web`: Next.js app
- `packages/types`: generated database types (`pnpm db:types`)
- `packages/worker`: MusicBrainz sync worker (Phase 2)
- `supabase/`: config, migrations, seed, pgTAP tests
