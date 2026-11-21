import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffMs, createMusicBrainzClient, MusicBrainzBusy, MusicBrainzError, retryAfterMs, USER_AGENT } from "./client.ts";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("createMusicBrainzClient", () => {
  it("sends the User-Agent and fmt=json", async () => {
    const fetchMock = vi.fn(async () => ok({ id: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    const mb = createMusicBrainzClient({ minIntervalMs: 0 });

    await expect(mb.get("release-group/abc", { inc: "releases" })).resolves.toEqual({ id: "x" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://musicbrainz.org/ws/2/release-group/abc?inc=releases&fmt=json");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
  });

  it("spaces requests minIntervalMs apart", async () => {
    const times: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => (times.push(Date.now()), ok({}))));
    const mb = createMusicBrainzClient({ minIntervalMs: 50 });

    await Promise.all([mb.get("a"), mb.get("b"), mb.get("c")]);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(45);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(45);
  });

  it("fails fast with MusicBrainzBusy when the queue is longer than maxQueueWaitMs, without sending", async () => {
    const fetchMock = vi.fn(async () => ok({}));
    vi.stubGlobal("fetch", fetchMock);
    const mb = createMusicBrainzClient({ minIntervalMs: 1000 });

    const first = mb.get("a"); // Takes the slot; the next turn is ~1 s away.
    await expect(mb.get("b", {}, { maxQueueWaitMs: 200 })).rejects.toBeInstanceOf(MusicBrainzBusy);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws MusicBrainzError with the status on a 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const mb = createMusicBrainzClient({ minIntervalMs: 0 });

    const err = await mb.get("release-group/gone").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MusicBrainzError);
    expect((err as MusicBrainzError).status).toBe(404);
  });

  it("retries a 503 with backoff and returns the later success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok({ id: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    const mb = createMusicBrainzClient({ minIntervalMs: 0, retryBaseMs: 5 });

    await expect(mb.get("release/x")).resolves.toEqual({ id: "x" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after the allowed retries with the last error", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const mb = createMusicBrainzClient({ minIntervalMs: 0, retryBaseMs: 5 });

    const err = await mb.get("release/x", {}, { retries: 1 }).catch((e: unknown) => e);
    expect((err as MusicBrainzError).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry when retries is 0, or on a 4xx", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const mb = createMusicBrainzClient({ minIntervalMs: 0, retryBaseMs: 5 });
    await expect(mb.get("a", {}, { retries: 0 })).rejects.toBeInstanceOf(MusicBrainzError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const notFound = vi.fn(async () => new Response("", { status: 400 }));
    vi.stubGlobal("fetch", notFound);
    await expect(mb.get("b")).rejects.toBeInstanceOf(MusicBrainzError);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("retries timeouts and network errors as MusicBrainzError", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const mb = createMusicBrainzClient({ minIntervalMs: 0, retryBaseMs: 5 });

    const err = await mb.get("a", {}, { retries: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MusicBrainzError);
    expect((err as Error).message).toMatch(/fetch failed/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("backoffMs and retryAfterMs", () => {
  it("doubles the wait each retry, plus up to half a base of jitter", () => {
    expect([1, 2, 3].map((n) => backoffMs(n, 2000, () => 0))).toEqual([2000, 4000, 8000]);
    expect(backoffMs(1, 2000, () => 1)).toBe(3000);
  });

  it("reads Retry-After as seconds or a date, capped at 30 s", () => {
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs("600")).toBe(30_000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 5_000)).toBe(5000);
    expect(retryAfterMs("soon")).toBeNull();
  });
});
