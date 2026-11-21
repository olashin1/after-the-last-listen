// Data for the album page. Server-only.
// Tracklists load on demand (PRD §7): the first visit fetches the canonical release's tracks from
// MusicBrainz and stores them with set_album_tracks(); later visits read them from the catalog.

import { fetchReleaseTracks } from "@/lib/musicbrainz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type TracklistStatus = "loaded" | "no_release" | "unavailable";

export async function getAlbumPage(albumId: number) {
  const supabase = await createClient();
  const { data: album, error } = await supabase.rpc("get_album", { p_album_id: albumId }).maybeSingle();
  if (error) throw new Error(`get_album failed: ${error.message}`);
  if (!album) return null;

  let status: TracklistStatus = "loaded";
  if (!album.canonical_release_mbid) {
    status = "no_release";
  } else if (!album.tracks_current) {
    try {
      const tracks = await fetchReleaseTracks(album.canonical_release_mbid);
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
      // MusicBrainz down, rate-limited or slow: show the album without tracks; the next visit retries.
      console.error(`Tracklist load failed for album ${album.id}:`, err instanceof Error ? err.message : err);
      status = "unavailable";
    }
  }

  const { data: tracks, error: tracksError } = await supabase.rpc("get_album_tracks", { p_album_id: album.id });
  if (tracksError) throw new Error(`get_album_tracks failed: ${tracksError.message}`);

  // Tracks from an older canonical release are still worth showing if the reload failed.
  if (status === "unavailable" && tracks.length > 0) status = "loaded";
  return { album, tracks, status };
}
