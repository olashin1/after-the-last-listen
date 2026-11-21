// The web app's MusicBrainz API client: one rate-limited queue for this server process.
// The adapter itself lives in the shared package packages/musicbrainz (CLAUDE.md: every API call
// goes through it). Server-only.

import { createMusicBrainzClient } from "@atll/musicbrainz";

export { formatDuration, MusicBrainzBusy, MusicBrainzError, type ReleaseTrack } from "@atll/musicbrainz";

/** Requests 1.1 s apart (MusicBrainz allows about 1 per second per IP). */
export const musicbrainz = createMusicBrainzClient({ minIntervalMs: 1100 });
