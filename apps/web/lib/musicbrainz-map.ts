// Map a MusicBrainz release (GET /ws/2/release/<mbid>?inc=recordings) to our track rows.
// Pure, so it's unit-tested.

export type ReleaseTrack = {
  disc_number: number;
  position: number;
  recording_mbid: string;
  title: string;
  length_ms: number | null;
};

type MbTrack = { position?: unknown; title?: unknown; length?: unknown; recording?: { id?: unknown; title?: unknown; length?: unknown } };
type MbMedium = { position?: unknown; tracks?: unknown };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const positiveInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null);
const length = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * One row per track, discs in medium order and tracks in position order. The track title is the
 * one printed on this release (falls back to the recording's title). Tracks without a valid
 * recording MBID are skipped, since the Shooting Star needs one.
 */
export function mapReleaseTracks(release: unknown): ReleaseTrack[] {
  const media = (release as { media?: unknown })?.media;
  if (!Array.isArray(media)) return [];

  const rows: ReleaseTrack[] = [];
  (media as MbMedium[]).forEach((medium, index) => {
    const disc = positiveInt(medium?.position) ?? index + 1;
    const tracks = Array.isArray(medium?.tracks) ? (medium.tracks as MbTrack[]) : [];
    tracks.forEach((track, i) => {
      const recordingMbid = text(track?.recording?.id).toLowerCase();
      const title = text(track?.title) || text(track?.recording?.title);
      if (!UUID_RE.test(recordingMbid) || !title) return;
      rows.push({
        disc_number: disc,
        position: positiveInt(track?.position) ?? i + 1,
        recording_mbid: recordingMbid,
        title,
        length_ms: length(track?.length) ?? length(track?.recording?.length),
      });
    });
  });

  // Same disc and position twice (bad upstream data) would break the primary key: keep the first.
  const seen = new Set<string>();
  return rows
    .sort((a, b) => a.disc_number - b.disc_number || a.position - b.position)
    .filter((t) => {
      const key = `${t.disc_number}:${t.position}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** "3:05" for 185000 ms, "1:02:03" for over an hour, "" when unknown. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
