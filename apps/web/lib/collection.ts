// Collection and diary reads. Server-only.
// Each wraps a Postgres read function (get_user_album, get_collection, get_diary). They're security
// invoker, so RLS decides what comes back: a private user's albums and diary are empty for everyone
// but the owner. The generated types mark every returned column non-null, so the types here say
// which ones can actually be NULL.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type UserAlbum = {
  id: number;
  rating: number | null;
  review: string | null;
  shooting_star_recording_mbid: string | null;
  shooting_star_title: string | null;
  listen_count: number;
  first_listened_on: string;
  last_listened_on: string;
};

export type CollectionItem = {
  user_album_id: number;
  album_id: number;
  mbid: string;
  title: string;
  artist_credit: string;
  first_release_date: string | null;
  rating: number | null;
  shooting_star_title: string | null;
  listen_count: number;
  last_listened_on: string;
  review: string | null;
};

export type DiaryItem = {
  listen_id: number;
  listened_on: string;
  note: string | null;
  created_at: string;
  album_id: number;
  mbid: string;
  title: string;
  artist_credit: string;
  first_release_date: string | null;
  rating: number | null;
  shooting_star_title: string | null;
  /** The album's review, on its most recent listen only (NULL on older rows and unreviewed albums). */
  review: string | null;
};

export const COLLECTION_PAGE = 48;
export const DIARY_PAGE = 50;

/** The signed-in user's entry for an album, or null (signed out, or not logged). Cached per request. */
export const getUserAlbum = cache(async (albumId: number): Promise<UserAlbum | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_user_album", { p_album_id: albumId }).maybeSingle();
  if (error) throw new Error(`get_user_album failed: ${error.message}`);
  return (data as UserAlbum | null) ?? null;
});

/** Cursor for the next collection page: "<last_listened_on>_<user_album_id>". */
export function collectionCursor(item: CollectionItem): string {
  return `${item.last_listened_on}_${item.user_album_id}`;
}

function parseCursor(cursor: string | undefined): [string, number] | null {
  const match = cursor?.match(/^(\d{4}-\d{2}-\d{2})_(\d{1,18})$/);
  return match ? [match[1]!, Number(match[2])] : null;
}

export async function getCollection(username: string, cursor?: string) {
  const before = parseCursor(cursor);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_collection", {
    p_username: username,
    p_before_listened: before?.[0],
    p_before_id: before?.[1],
    p_lim: COLLECTION_PAGE + 1,
  });
  if (error) throw new Error(`get_collection failed: ${error.message}`);
  const items = data as CollectionItem[];
  return { items: items.slice(0, COLLECTION_PAGE), hasMore: items.length > COLLECTION_PAGE };
}

export const PROFILE_RECENT = 3;

/** The profile page's sections: the most recently listened albums, and the most recent reviewed ones. */
export async function getRecent(username: string) {
  const supabase = await createClient();
  const [recent, reviewed] = await Promise.all([
    supabase.rpc("get_collection", { p_username: username, p_lim: PROFILE_RECENT }),
    supabase.rpc("get_collection", { p_username: username, p_lim: PROFILE_RECENT, p_reviewed_only: true }),
  ]);
  if (recent.error) throw new Error(`get_collection failed: ${recent.error.message}`);
  if (reviewed.error) throw new Error(`get_collection failed: ${reviewed.error.message}`);
  return { recent: recent.data as CollectionItem[], reviewed: reviewed.data as CollectionItem[] };
}

/** Cursor for the next diary page: "<listened_on>_<listen_id>_<created_at>". */
export function diaryCursor(item: DiaryItem): string {
  return `${item.listened_on}_${item.listen_id}_${item.created_at}`;
}

export async function getDiary(username: string, cursor?: string) {
  const match = cursor?.match(/^(\d{4}-\d{2}-\d{2})_(\d{1,18})_(.+)$/);
  const createdAt = match && !Number.isNaN(Date.parse(match[3]!)) ? match[3]! : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_diary", {
    p_username: username,
    p_before_listened: createdAt ? match![1] : undefined,
    p_before_id: createdAt ? Number(match![2]) : undefined,
    p_before_created: createdAt ?? undefined,
    p_lim: DIARY_PAGE + 1,
  });
  if (error) throw new Error(`get_diary failed: ${error.message}`);
  const items = data as DiaryItem[];
  return { items: items.slice(0, DIARY_PAGE), hasMore: items.length > DIARY_PAGE };
}
