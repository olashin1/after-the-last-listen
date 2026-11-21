// The one MusicBrainz API adapter (CLAUDE.md: every API call goes through it). Server-only.
//
// MusicBrainz rules (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting, checked 2026-11-21):
// about 1 request per second per IP, a 503 when over it, and a User-Agent of the form
// "App/version ( contact )". Requests here are queued and spaced at least MIN_INTERVAL_MS apart.
//
// The queue is per server process. With several server instances (e.g. serverless) each has its
// own; revisit when deploying (docs/decisions.md). The Phase 2 sync worker will share this adapter.

import { mapReleaseTracks, type ReleaseTrack } from "./musicbrainz-map";

const API = "https://musicbrainz.org/ws/2";
// Contact URL decided with the user (2026-11-21): the project's public GitHub page.
export const USER_AGENT = "AfterTheLastListen/0.1 ( https://github.com/olashin1/after-the-last-listen )";
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 10_000;
const RETRY_AFTER_503_MS = 2_000;

let nextSlot = 0;
let queue: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for this request's turn: callers run one at a time, MIN_INTERVAL_MS apart. */
function takeTurn(): Promise<void> {
  const turn = queue.then(async () => {
    const wait = nextSlot - Date.now();
    if (wait > 0) await sleep(wait);
    nextSlot = Date.now() + MIN_INTERVAL_MS;
  });
  queue = turn.catch(() => {});
  return turn;
}

export class MusicBrainzError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** GET a MusicBrainz API path as JSON, e.g. mbGet("release/<mbid>", { inc: "recordings" }). */
export async function mbGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, fmt: "json" })}`;
  for (let attempt = 1; ; attempt++) {
    await takeTurn();
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) return res.json();
    // 503 means rate-limited (or overloaded): back off once, then give up.
    if (res.status === 503 && attempt === 1) {
      await sleep(RETRY_AFTER_503_MS);
      continue;
    }
    throw new MusicBrainzError(`MusicBrainz ${path} failed: ${res.status}`, res.status);
  }
}

/** Tracklist of one release, in order. */
export async function fetchReleaseTracks(releaseMbid: string): Promise<ReleaseTrack[]> {
  return mapReleaseTracks(await mbGet(`release/${releaseMbid}`, { inc: "recordings" }));
}
