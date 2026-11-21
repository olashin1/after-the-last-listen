// The one MusicBrainz API adapter (CLAUDE.md: every API call goes through it). Server-only.
// Used by the web app (apps/web/lib/musicbrainz.ts) and the sync worker.
//
// MusicBrainz rules (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting, checked 2026-11-21):
// about 1 request per second per IP, a 503 when over it, and a User-Agent of the form
// "App/version ( contact )". Requests from one client are queued and spaced minIntervalMs apart.
//
// Each process creates its own client, so each has its own queue. Several server instances (e.g.
// serverless) don't share a limit; revisit before deploying (docs/decisions.md).

import { mapReleaseTracks, type ReleaseTrack } from "./tracks.ts";

const API = "https://musicbrainz.org/ws/2";
// Contact URL decided with the user (2026-11-21): the project's public GitHub page.
export const USER_AGENT = "AfterTheLastListen/0.1 ( https://github.com/olashin1/after-the-last-listen )";
const TIMEOUT_MS = 10_000;
const RETRY_AFTER_503_MS = 2_000;

export class MusicBrainzError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "MusicBrainzError";
    this.status = status;
  }
}

/** The queue is too long to wait for (only when the caller set maxQueueWaitMs). Nothing was sent. */
export class MusicBrainzBusy extends Error {
  constructor(waitMs: number) {
    super(`MusicBrainz queue busy (about ${Math.round(waitMs)} ms wait)`);
    this.name = "MusicBrainzBusy";
  }
}

export type GetOptions = {
  /** Fail fast with MusicBrainzBusy instead of waiting longer than this for a turn. */
  maxQueueWaitMs?: number;
};

export type MusicBrainzClient = {
  /** GET a MusicBrainz API path as JSON, e.g. get("release/<mbid>", { inc: "recordings" }). */
  get(path: string, params?: Record<string, string>, options?: GetOptions): Promise<unknown>;
  /** Tracklist of one release, in order. */
  fetchReleaseTracks(releaseMbid: string): Promise<ReleaseTrack[]>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMusicBrainzClient({ minIntervalMs = 1100 }: { minIntervalMs?: number } = {}): MusicBrainzClient {
  let nextSlot = 0;
  let pending = 0;
  let queue: Promise<void> = Promise.resolve();

  /** Roughly how long a new request would wait for its turn. */
  const expectedWait = () => Math.max(0, nextSlot - Date.now()) + pending * minIntervalMs;

  /** Wait for this request's turn: callers run one at a time, minIntervalMs apart. */
  function takeTurn(): Promise<void> {
    pending++;
    const turn = queue.then(async () => {
      const wait = nextSlot - Date.now();
      if (wait > 0) await sleep(wait);
      nextSlot = Date.now() + minIntervalMs;
      pending--;
    });
    queue = turn.catch(() => {});
    return turn;
  }

  async function get(path: string, params: Record<string, string> = {}, options: GetOptions = {}): Promise<unknown> {
    const url = `${API}/${path}?${new URLSearchParams({ ...params, fmt: "json" })}`;
    for (let attempt = 1; ; attempt++) {
      if (options.maxQueueWaitMs !== undefined) {
        const wait = expectedWait();
        if (wait > options.maxQueueWaitMs) throw new MusicBrainzBusy(wait);
      }
      await takeTurn();
      // `cache` isn't in Node's RequestInit type, but Next's patched fetch reads it: never cache upstream data.
      const init = {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      } as RequestInit;
      const res = await fetch(url, init);
      if (res.ok) return res.json();
      // 503 means rate-limited (or overloaded): back off once, then give up.
      if (res.status === 503 && attempt === 1) {
        await sleep(RETRY_AFTER_503_MS);
        continue;
      }
      throw new MusicBrainzError(`MusicBrainz ${path} failed: ${res.status}`, res.status);
    }
  }

  return {
    get,
    fetchReleaseTracks: async (releaseMbid) => mapReleaseTracks(await get(`release/${releaseMbid}`, { inc: "recordings" })),
  };
}
