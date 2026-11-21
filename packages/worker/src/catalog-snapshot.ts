// Save and restore the imported catalog, so `pnpm db:reset` doesn't cost a 25-minute re-import.
//
//   pnpm catalog:snapshot   dump the catalog schema's data to .cache/catalog/catalog.dump
//   pnpm catalog:restore    load it back into an empty catalog (e.g. right after `pnpm db:reset`)
//
// Local only: runs pg_dump / pg_restore inside the local Supabase database container (Docker),
// so nothing extra needs installing. The snapshot records which migrations it was taken with;
// restore refuses a snapshot from a different catalog schema (re-import instead).

import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { connect } from "./db.ts";
import { REPO_ROOT } from "./paths.ts";

const SNAPSHOT_DIR = path.join(REPO_ROOT, ".cache", "catalog");
const SNAPSHOT = path.join(SNAPSHOT_DIR, "catalog.dump");
const META = path.join(SNAPSHOT_DIR, "catalog.json");
const IN_CONTAINER = "/tmp/catalog.dump";

const started = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);

/** schema: fingerprint of the catalog tables' columns (names, types, order), so a restore can tell whether
 *  the data still fits. Migrations that don't touch catalog tables don't change it. */
type Meta = { taken_at: string; schema: string; albums: number; artists: number; tracks: number };

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} exited with ${code}`))));
  });
}

async function container(): Promise<string> {
  const config = await readFile(path.join(REPO_ROOT, "supabase", "config.toml"), "utf8");
  const id = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!id) throw new Error("project_id not found in supabase/config.toml");
  return `supabase_db_${id}`;
}

async function state(): Promise<Omit<Meta, "taken_at">> {
  const sql = connect();
  try {
    const [fp] = await sql<{ schema: string }[]>`
      select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_generated, ','
                 order by table_name, ordinal_position), '')) as schema
      from information_schema.columns where table_schema = 'catalog'
    `;
    const [c] = await sql<{ albums: number; artists: number; tracks: number }[]>`
      select (select count(*) from catalog.albums)::int as albums,
             (select count(*) from catalog.artists)::int as artists,
             (select count(*) from catalog.tracks)::int as tracks
    `;
    return { schema: fp!.schema, ...c! };
  } finally {
    await sql.end();
  }
}

async function snapshot() {
  const now = await state();
  if (now.albums === 0) throw new Error("The catalog is empty; import it first (pnpm catalog:import).");
  const db = await container();
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  log(`Dumping ${now.albums.toLocaleString()} albums, ${now.artists.toLocaleString()} artists, ${now.tracks.toLocaleString()} tracks…`);
  await run("docker", ["exec", db, "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc", "--data-only", "--schema=catalog", "-f", IN_CONTAINER]);
  await run("docker", ["cp", `${db}:${IN_CONTAINER}`, SNAPSHOT]);
  await run("docker", ["exec", db, "rm", "-f", IN_CONTAINER]);
  const meta: Meta = { taken_at: new Date().toISOString(), ...now };
  await writeFile(META, JSON.stringify(meta, null, 2) + "\n");
  log(`Saved ${SNAPSHOT} (${((await stat(SNAPSHOT)).size / 1e6).toFixed(0)} MB).`);
}

async function restore() {
  const meta = JSON.parse(await readFile(META, "utf8").catch(() => "null")) as Meta | null;
  if (!meta || !(await stat(SNAPSHOT).catch(() => null))) {
    throw new Error(`No snapshot in ${SNAPSHOT_DIR}. Run pnpm catalog:import, then pnpm catalog:snapshot.`);
  }
  const now = await state();
  if (now.albums > 0) throw new Error(`The catalog already has ${now.albums.toLocaleString()} albums. Restore only into an empty catalog (after pnpm db:reset).`);
  // The snapshot is data only, so it must fit the current catalog tables. Refuse rather than
  // half-restore if a migration has changed their columns since.
  if (meta.schema !== now.schema) {
    throw new Error(
      "The catalog tables have changed since this snapshot was taken. " +
        "Re-import with pnpm catalog:import and pnpm catalog:canonical, then take a new snapshot.",
    );
  }

  const db = await container();
  log(`Restoring snapshot from ${meta.taken_at}: ${meta.albums.toLocaleString()} albums…`);
  await run("docker", ["cp", SNAPSHOT, `${db}:${IN_CONTAINER}`]);
  try {
    await run("docker", ["exec", db, "pg_restore", "-U", "postgres", "-d", "postgres", "--data-only", "--single-transaction", "--exit-on-error", IN_CONTAINER]);
  } finally {
    await run("docker", ["exec", db, "rm", "-f", IN_CONTAINER]);
  }
  const after = await state();
  log(`Restored ${after.albums.toLocaleString()} albums, ${after.artists.toLocaleString()} artists, ${after.tracks.toLocaleString()} tracks.`);
}

const command = process.argv[2];
(command === "snapshot" ? snapshot() : command === "restore" ? restore() : Promise.reject(new Error("Usage: catalog-snapshot.ts snapshot|restore")))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
