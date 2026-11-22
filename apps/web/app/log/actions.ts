"use server";

// Server Actions behind the Log dialog (components/log). They only pass values through: all
// validation and the writes happen in log_album() / update_user_album() (CLAUDE.md), and errors come
// back as the function's error name, translated by dbErrorMessage().

import { refresh } from "next/cache";
import { getAlbum, getTracklist, type TracklistStatus } from "@/lib/album";
import { getUserAlbum } from "@/lib/collection";
import { isIsoDate } from "@/lib/dates";
import { dbErrorMessage } from "@/lib/messages";
import { parseRating } from "@/lib/rating";
import { isWeak, liveFallback, searchAlbums, type SearchResult } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

export type LogSearchResult = {
  id: number;
  mbid: string;
  title: string;
  artist: string;
  detail: string;
};

function toLogResult(r: SearchResult): LogSearchResult {
  const year = r.first_release_date?.slice(0, 4);
  const type = r.primary_type !== "Album" || r.secondary_types.length > 0 ? [r.primary_type, ...r.secondary_types].join(" + ") : "";
  return {
    id: r.id,
    mbid: r.mbid,
    title: r.title,
    artist: r.artist_credit || "Unknown artist",
    detail: [year, type].filter(Boolean).join(" · "),
  };
}

function cleanQuery(q: unknown): string {
  return typeof q === "string" ? q.trim().slice(0, 200) : "";
}

/** Local catalog search for the dialog. `weak` says whether to ask MusicBrainz next. */
export async function searchForLog(q: unknown): Promise<{ results: LogSearchResult[]; weak: boolean; error?: string }> {
  const query = cleanQuery(q);
  if (query.length < 2) return { results: [], weak: false };
  try {
    const { results } = await searchAlbums(query, 12);
    return { results: results.map(toLogResult), weak: isWeak(results) };
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return { results: [], weak: false, error: "Search isn't working right now. Try again in a moment." };
  }
}

/** The live MusicBrainz fallback, same rules as /search (lib/search.ts). Never throws. */
export async function liveSearchForLog(q: unknown, shownIds: unknown): Promise<LogSearchResult[]> {
  const query = cleanQuery(q);
  if (query.length < 2) return [];
  const shown = new Set(Array.isArray(shownIds) ? shownIds.filter((id): id is number => Number.isInteger(id)) : []);
  return (await liveFallback(query, shown)).map(toLogResult);
}

export type LogTrack = { recording_mbid: string; title: string; disc_number: number; position: number };

export type LogContext = {
  album: { id: number; mbid: string; title: string; artist: string; year: string | null };
  tracks: LogTrack[];
  tracksStatus: TracklistStatus;
  entry: {
    rating: number | null;
    review: string;
    shootingStarMbid: string | null;
    shootingStarTitle: string | null;
    listenCount: number;
  } | null;
};

/** Everything the log form needs: the album, its tracklist (loaded on demand) and the caller's entry. */
export async function getLogContext(albumId: unknown): Promise<LogContext | { error: string }> {
  if (!Number.isSafeInteger(albumId)) return { error: "We couldn't find that album." };
  let album = await getAlbum(albumId as number);
  // A merged album logs as its survivor, like its page redirects.
  if (album && "mergedInto" in album) album = await getAlbum(album.mergedInto);
  if (!album || "mergedInto" in album) return { error: "We couldn't find that album." };

  const [{ tracks, status }, entry] = await Promise.all([getTracklist(album), getUserAlbum(album.id)]);
  return {
    album: {
      id: album.id,
      mbid: album.mbid,
      title: album.title,
      artist: album.artist_credit || "Unknown artist",
      year: album.first_release_date?.slice(0, 4) ?? null,
    },
    tracks: tracks.map((t) => ({ recording_mbid: t.recording_mbid, title: t.title, disc_number: t.disc_number, position: t.position })),
    tracksStatus: status,
    entry: entry && {
      rating: entry.rating === null ? null : Number(entry.rating),
      review: entry.review ?? "",
      shootingStarMbid: entry.shooting_star_recording_mbid,
      shootingStarTitle: entry.shooting_star_title,
      listenCount: entry.listen_count,
    },
  };
}

export type SaveResult = { ok: true } | { ok: false; error: string };

type EntryInput = { albumId: unknown; rating: unknown; review: unknown; shootingStarMbid: unknown };

function entryArgs(input: EntryInput) {
  return {
    p_album_id: Number(input.albumId),
    // Unrated is NULL; supabase-js drops undefined, which the function's defaults turn into NULL.
    p_rating: parseRating(input.rating) ?? undefined,
    p_review: typeof input.review === "string" ? input.review : undefined,
    p_shooting_star_recording_mbid: typeof input.shootingStarMbid === "string" && input.shootingStarMbid ? input.shootingStarMbid : undefined,
  };
}

/** Log a listen: saves the collection record and the diary date in one log_album() call. */
export async function logAlbum(
  input: EntryInput & { listenedOn: unknown; today: unknown; requestId: unknown },
): Promise<SaveResult> {
  if (!isIsoDate(input.listenedOn) || !isIsoDate(input.today)) return { ok: false, error: dbErrorMessage("invalid_date") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_album", {
    ...entryArgs(input),
    p_listened_on: input.listenedOn,
    p_today: input.today,
    p_request_id: typeof input.requestId === "string" ? input.requestId : undefined,
  });
  if (error) return { ok: false, error: dbErrorMessage(error.message) };
  refresh();
  return { ok: true };
}

/** Edit rating, review and Shooting Star without adding a listen. */
export async function updateEntry(input: EntryInput): Promise<SaveResult> {
  const args = entryArgs(input);
  const supabase = await createClient();
  // update_user_album replaces every field, so pass explicit NULLs.
  const { error } = await supabase.rpc("update_user_album", {
    p_album_id: args.p_album_id,
    p_rating: (args.p_rating ?? null) as number,
    p_review: (args.p_review ?? null) as string,
    p_shooting_star_recording_mbid: (args.p_shooting_star_recording_mbid ?? null) as string,
  });
  if (error) return { ok: false, error: dbErrorMessage(error.message) };
  refresh();
  return { ok: true };
}
