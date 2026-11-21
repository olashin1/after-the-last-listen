// Data for the album page. Server-only.
// Tracklists load on demand (PRD §7): the first visit fetches the canonical release's tracks from
// MusicBrainz and stores them with set_album_tracks(); later visits read them from the catalog.
// The page loads the album and its tracklist separately, so a slow or failing MusicBrainz only
// delays the tracklist section, never the rest of the page.

import type { Database } from "@atll/types";
import { musicbrainz } from "@/lib/musicbrainz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Album = Database["public"]["Functions"]["get_album"]["Returns"][number];
export type TracklistStatus = "loaded" | "no_release" | "unavailable";

/** The album, null if there's no such id, or the survivor's id if it was merged upstream. */
export async function getAlbum(albumId: number): Promise<Album | { mergedInto: number } | null> {
  const supabase = await createClient();
  const { data: album, error } = await supabase.rpc("get_album", { p_album_id: albumId }).maybeSingle();
  if (error) throw new Error(`get_album failed: ${error.message}`);
  if (!album) return null;
  if (album.merged_into_id !== null) return { mergedInto: album.merged_into_id };
  return album;
}

/** The album's tracklist, loading it from MusicBrainz first if it isn't stored or is stale. */
export async function getTracklist(album: Album) {
  let status: TracklistStatus = "loaded";
  if (!album.canonical_release_mbid) {
    status = "no_release";
  } else if (!album.tracks_current) {
    try {
      const tracks = await musicbrainz.fetchReleaseTracks(album.canonical_release_mbid);
      if (tracks.length === 0) {
        status = "unavailable";
      } else {
        const { error: saveError } = await createAdminClient().rpc("set_album_tracks", {
          p_album_id: album.id,
          p_release_mbid: album.canonical_release_mbid,
          p_tracks: tracks,
        });
        if (saveError) throw new Error(`set_album_tracks failed: ${saveError.message}`);
      }
    } catch (err) {
      // MusicBrainz still down or overloaded after the adapter's retries: show the album without
      // tracks; the next visit tries again.
      console.error(`Tracklist load failed for album ${album.id}:`, err instanceof Error ? err.message : err);
      status = "unavailable";
    }
  }

  const supabase = await createClient();
  const { data: tracks, error } = await supabase.rpc("get_album_tracks", { p_album_id: album.id });
  if (error) throw new Error(`get_album_tracks failed: ${error.message}`);

  // Tracks from an older canonical release are still worth showing if the reload failed.
  if (status === "unavailable" && tracks.length > 0) status = "loaded";
  return { tracks, status };
}
