// The landing page's cover wall (docs/decisions.md, landing page): a hand-picked mix of widely known
// albums across genres. The catalog's only popularity signal (URL link count) ranks obscure albums
// first, so it can't pick these; swap this for real popularity (ListenBrainz, Phase 5) later.
// MBIDs are release groups, checked against the local catalog and the Cover Art Archive on
// 2026-11-22. Edit freely: get_albums_by_mbid() skips unknown or retired ones and follows merges.
// Server-only.

import { createClient } from "@/lib/supabase/server";

export const FEATURED_MBIDS = [
  "9162580e-5df4-32de-80cc-f45a8d8a9b1d", // The Beatles, Abbey Road
  "d9103c72-3807-4378-9ce7-b6f3e8fdd547", // Kendrick Lamar, To Pimp a Butterfly
  "416bb5e5-c7d1-3977-8fd7-7c9daf6c2be6", // Fleetwood Mac, Rumours
  "48117b90-a16e-34ca-a514-19c702df1158", // Daft Punk, Discovery
  "f5093c06-23e3-404f-aeaa-40f72885ee3a", // Pink Floyd, The Dark Side of the Moon
  "8691d12c-abd8-385c-b1eb-d841190124f7", // Lauryn Hill, The Miseducation of Lauryn Hill
  "b1392450-e666-3926-a536-22c65f834433", // Radiohead, OK Computer
  "f1d08326-c23b-4b43-be3b-20b33ab10bf6", // Taylor Swift, folklore
  "8e8a594f-2175-38c7-a871-abb68ec363e7", // Miles Davis, Kind of Blue
  "f32fab67-77dd-3937-addc-9062e28e4c37", // Michael Jackson, Thriller
  "1b022e01-4da6-387b-8658-8678046e4cef", // Nirvana, Nevermind
  "6eac2e57-ee50-36f8-b0c4-c4c847a2c098", // Amy Winehouse, Back to Black
];

export type FeaturedAlbum = { id: number; mbid: string; title: string; artist_credit: string };

export async function getFeaturedAlbums(): Promise<FeaturedAlbum[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_albums_by_mbid", { p_mbids: FEATURED_MBIDS });
  if (error) throw new Error(`get_albums_by_mbid failed: ${error.message}`);
  return data;
}
