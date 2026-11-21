import postgres from "postgres";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Connect with DATABASE_URL (packages/worker/.env.local). Refuses anything but the local
 * Supabase stack unless allowRemote is set, so a stray env var can't load into a hosted project.
 */
export function connect({ allowRemote = false } = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL. Copy packages/worker/.env.example to packages/worker/.env.local.");
  }
  const host = new URL(url).hostname;
  if (!allowRemote && !LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to connect to non-local host "${host}". Pass --allow-remote if you really mean it.`);
  }
  return postgres(url, { max: 1, onnotice: () => {} });
}

export type Sql = ReturnType<typeof connect>;
