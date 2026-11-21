// Download and stream MetaBrainz data dumps (checked 2026-11-21):
//   JSON dumps:      https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/
//   Canonical data:  https://data.metabrainz.org/pub/musicbrainz/canonical_data/
// These are file downloads, not the MusicBrainz API, so the rate-limited API adapter doesn't apply.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const DUMP_BASE = "https://data.metabrainz.org/pub/musicbrainz/data/json-dumps";
export const CANONICAL_BASE = "https://data.metabrainz.org/pub/musicbrainz/canonical_data";
export const RELEASE_GROUP_FILE = "release-group.tar.xz";
// Contact URL decided with the user (2026-11-21): the project's public GitHub page.
export const USER_AGENT = "AfterTheLastListen/0.1 ( https://github.com/olashin1/after-the-last-listen )";

type Log = (msg: string) => void;

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res;
}

/** Newest folder name in a MetaBrainz listing that matches `pattern` (sorted as text). */
async function latestFolder(baseUrl: string, pattern: RegExp): Promise<string> {
  const html = await (await get(`${baseUrl}/`)).text();
  const names = [...html.matchAll(/href="([^"/]+)\/"/g)].map((m) => m[1]!).filter((n) => pattern.test(n)).sort();
  const latest = names.at(-1);
  if (!latest) throw new Error(`No dump folders found at ${baseUrl}/`);
  return latest;
}

/** Newest JSON dump folder, e.g. "20261118-001001". */
export const latestDumpDate = () => latestFolder(DUMP_BASE, /^\d{8}-\d{6}$/);
/** Newest canonical dump folder, e.g. "musicbrainz-canonical-dump-20261117-080003". */
export const latestCanonicalDump = () => latestFolder(CANONICAL_BASE, /^musicbrainz-canonical-dump-\d{8}-\d{6}$/);

export function parseSha256Sums(text: string, file: string): string {
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})(?:\s+\*?(.+))?$/i.exec(line.trim());
    // A file with only a hash (canonical dumps' .sha256) applies to its archive.
    if (m && (m[2] === undefined || path.basename(m[2]) === file)) return m[1]!.toLowerCase();
  }
  throw new Error(`No SHA-256 for ${file}`);
}

/**
 * Make sure `file` exists, downloading `url` if needed. The download goes to a `.part` file that
 * is renamed only after its SHA-256 matches `checksumUrl`, so a file at the final path is always
 * a verified one.
 */
export async function ensureDownload(url: string, checksumUrl: string, file: string, log: Log): Promise<string> {
  if (await stat(file).catch(() => null)) {
    log(`Using cached ${file}`);
    return file;
  }
  await mkdir(path.dirname(file), { recursive: true });
  const name = path.basename(file);
  const expected = parseSha256Sums(await (await get(checksumUrl)).text(), name);

  const res = await get(url);
  const total = Number(res.headers.get("content-length") ?? 0);
  log(`Downloading ${name} (${(total / 1e9).toFixed(2)} GB)…`);

  const partial = `${file}.part`;
  const hash = createHash("sha256");
  let received = 0;
  let lastLogged = 0;
  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>);
  body.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    if (received - lastLogged > 100e6) {
      lastLogged = received;
      log(`  ${(received / 1e9).toFixed(2)} GB${total ? ` of ${(total / 1e9).toFixed(2)} GB` : ""}`);
    }
  });
  await pipeline(body, createWriteStream(partial));

  const actual = hash.digest("hex");
  if (actual !== expected) {
    await rm(partial, { force: true });
    throw new Error(`Checksum mismatch for ${name}: expected ${expected}, got ${actual}`);
  }
  await rename(partial, file);
  log("Download verified (SHA-256).");
  return file;
}

/** The JSON release-group dump for `date`, cached in `<cacheDir>/<date>/`. */
export function ensureReleaseGroupDump(cacheDir: string, date: string, log: Log): Promise<string> {
  return ensureDownload(
    `${DUMP_BASE}/${date}/${RELEASE_GROUP_FILE}`,
    `${DUMP_BASE}/${date}/SHA256SUMS`,
    path.join(cacheDir, date, RELEASE_GROUP_FILE),
    log,
  );
}

/** The canonical data dump `folder`, cached in `<cacheDir>/canonical/`. */
export function ensureCanonicalDump(cacheDir: string, folder: string, log: Log): Promise<string> {
  const file = `${folder}.tar.zst`;
  return ensureDownload(
    `${CANONICAL_BASE}/${folder}/${file}`,
    `${CANONICAL_BASE}/${folder}/${file}.sha256`,
    path.join(cacheDir, "canonical", file),
    log,
  );
}

/**
 * Stream one member of a tar archive line by line, without unpacking it to disk.
 * Uses the system `tar` (bsdtar on Windows and macOS, GNU tar on Linux), which reads .xz and .zst.
 */
export async function* archiveLines(archive: string, member: string): AsyncGenerator<string> {
  const tar = spawn("tar", ["-xOf", archive, member], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  tar.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  const exited = new Promise<number | null>((resolve) => tar.on("close", resolve));

  const lines = createInterface({ input: tar.stdout, crlfDelay: Infinity });
  let finished = false;
  try {
    for await (const line of lines) {
      if (line) yield line;
    }
    finished = true;
  } finally {
    if (!finished) tar.kill(); // Consumer stopped early (--limit).
  }
  const code = await exited;
  if (code !== 0) throw new Error(`tar exited with ${code}: ${stderr.trim()}`);
}

export const releaseGroupLines = (archive: string) => archiveLines(archive, "mbdump/release-group");
