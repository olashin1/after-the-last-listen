// The one MusicBrainz API adapter (CLAUDE.md: every API call goes through it). Server-only.
// Used by the web app (apps/web/lib/musicbrainz.ts) and the sync worker.
//
// MusicBrainz rules (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting, checked 2026-11-21):
// about 1 request per second per IP, a 503 when over it, and a User-Agent of the form
// "App/version ( contact )". Requests from one client are queued and spaced minIntervalMs apart.
//
// Failures worth retrying (503, which is how MusicBrainz says "over a limit" or "overloaded", other
// 5xx gateway errors, timeouts and network errors) are retried with growing, jittered waits. The
// docs give no Retry-After header or back-off numbers (checked 2026-11-21); a Retry-After is honoured
// if one ever appears.
//
// Each process creates its own client, so each has its own queue. Several server instances (e.g.
// serverless) don't share a limit; revisit before deploying (docs/decisions.md).

import { mapReleaseTracks, type ReleaseTrack } from "./tracks.ts";

const API = "https://musicbrainz.org/ws/2";
// Contact URL decided with the user (2026-11-21): the project's public GitHub page.
export const USER_AGENT = "AfterTheLastListen/0.1 ( https://github.com/olashin1/after-the-last-listen )";
const TIMEOUT_MS = 10_000;
const MAX_RETRY_AFTER_MS = 30_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

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
  /** Retries after a retryable failure (default 2, so up to 3 attempts). */
  retries?: number;
};

/** Wait before retry number `retry` (1-based): base, 2×base, 4×base…, plus up to half a base of jitter. */
export function backoffMs(retry: number, baseMs: number, random: () => number = Math.random): number {
  return baseMs * 2 ** (retry - 1) + Math.round(random() * baseMs * 0.5);
}

/** Retry-After in ms (seconds or an HTTP date), capped; null when absent or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, MAX_RETRY_AFTER_MS) : null;
}

export type MusicBrainzClient = {
  /** GET a MusicBrainz API path as JSON, e.g. get("release/<mbid>", { inc: "recordings" }). */
  get(path: string, params?: Record<string, string>, options?: GetOptions): Promise<unknown>;
  /** Tracklist of one release, in order. */
  fetchReleaseTracks(releaseMbid: string): Promise<ReleaseTrack[]>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMusicBrainzClient({
  minIntervalMs = 1100,
  retryBaseMs = 2000,
}: { minIntervalMs?: number; /** First retry wait; doubles each time. */ retryBaseMs?: number } = {}): MusicBrainzClient {
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
    const retries = Math.max(0, options.retries ?? 2);
    for (let attempt = 0; ; attempt++) {
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

      let error: MusicBrainzError;
      let wait: number | null = null;
      try {
        const res = await fetch(url, init);
        if (res.ok) return await res.json();
        error = new MusicBrainzError(`MusicBrainz ${path} failed: ${res.status}`, res.status);
        if (!RETRYABLE_STATUS.has(res.status)) throw error;
        wait = retryAfterMs(res.headers.get("retry-after"));
      } catch (err) {
        if (err instanceof MusicBrainzError && !RETRYABLE_STATUS.has(err.status ?? 0)) throw err;
        // Timeouts and network errors (fetch throws TypeError, or TimeoutError for the signal).
        error = err instanceof MusicBrainzError ? err : new MusicBrainzError(`MusicBrainz ${path} failed: ${err instanceof Error ? err.message : err}`);
      }
      if (attempt >= retries) throw error;
      await sleep(wait ?? backoffMs(attempt + 1, retryBaseMs));
    }
  }

  return {
    get,
    fetchReleaseTracks: async (releaseMbid) => mapReleaseTracks(await get(`release/${releaseMbid}`, { inc: "recordings" })),
  };
}
