"use server";

// Server Actions for removing an album and for the Listen List. They only pass the album id through:
// the checks and writes are in remove_user_album(), add_to_listen_list() and
// remove_from_listen_list() (CLAUDE.md), and errors come back as the function's error name.

import { refresh } from "next/cache";
import { dbErrorMessage } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

function albumIdOf(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : null;
}

/** Remove an album from your albums, with all its listens, rating, review and Shooting Star. */
export async function removeAlbum(albumId: unknown): Promise<ActionResult> {
  const id = albumIdOf(albumId);
  if (id === null) return { ok: false, error: dbErrorMessage("album_not_found") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_user_album", { p_album_id: id });
  if (error) return { ok: false, error: dbErrorMessage(error.message) };
  refresh();
  return { ok: true };
}

/** Add an album to (onList = true) or take it off (false) your Listen List. */
export async function setOnListenList(albumId: unknown, onList: unknown): Promise<ActionResult> {
  const id = albumIdOf(albumId);
  if (id === null) return { ok: false, error: dbErrorMessage("album_not_found") };
  const supabase = await createClient();
  const { error } = onList === true
    ? await supabase.rpc("add_to_listen_list", { p_album_id: id })
    : await supabase.rpc("remove_from_listen_list", { p_album_id: id });
  if (error) return { ok: false, error: dbErrorMessage(error.message) };
  refresh();
  return { ok: true };
}
