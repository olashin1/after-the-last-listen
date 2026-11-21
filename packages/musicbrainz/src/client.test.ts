import { afterEach, describe, expect, it, vi } from "vitest";
import { createMusicBrainzClient, MusicBrainzBusy, MusicBrainzError, USER_AGENT } from "./client.ts";

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
});
