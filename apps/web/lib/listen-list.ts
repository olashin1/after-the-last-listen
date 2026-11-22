// Listen List reads (docs/decisions.md, Listen List). Server-only.
// get_listen_list() is security invoker, so RLS hides a private user's list from everyone but the
// owner, the same as their albums and diary.

import { createClient } from "@/lib/supabase/server";

export type ListenListItem = {
  listen_list_id: number;
  album_id: number;
  mbid: string;
  title: string;
  artist_credit: string;
  first_release_date: string | null;
  added_at: string;
};

export const LISTEN_LIST_PAGE = 48;

/** Cursor for the next page: "<listen_list_id>_<added_at>". */
export function listenListCursor(item: ListenListItem): string {
  return `${item.listen_list_id}_${item.added_at}`;
}

export async function getListenList(username: string, cursor?: string) {
  const match = cursor?.match(/^(\d{1,18})_(.+)$/);
  const before = match && !Number.isNaN(Date.parse(match[2]!)) ? { id: Number(match[1]), added: match[2]! } : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_listen_list", {
    p_username: username,
    p_before_added: before?.added,
    p_before_id: before?.id,
    p_lim: LISTEN_LIST_PAGE + 1,
  });
  if (error) throw new Error(`get_listen_list failed: ${error.message}`);
  const items = data as ListenListItem[];
  return { items: items.slice(0, LISTEN_LIST_PAGE), hasMore: items.length > LISTEN_LIST_PAGE };
}

/** Whether the signed-in user has this album on their Listen List (false when signed out). */
export async function isOnListenList(albumId: number): Promise<boolean> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return false;
  const { count, error } = await supabase
    .from("listen_list")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("album_id", albumId);
  if (error) throw new Error(`listen_list read failed: ${error.message}`);
  return (count ?? 0) > 0;
}
