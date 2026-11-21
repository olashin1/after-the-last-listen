// What to do with an album that vanished from the dump, given its MusicBrainz API lookup
// (GET /ws/2/release-group/<mbid>). Pure, so it's unit-tested.

import { KEPT_PRIMARY_TYPES } from "./map.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LookupResult = { found: true; body: unknown } | { found: false };

export type VanishedAction =
  /** Merged upstream: the lookup answered with another release group. */
  | { action: "redirect"; newMbid: string }
  /** Deleted upstream, or no longer an Album/EP. */
  | { action: "retire"; reason: "deleted" | "not_album" }
  /** Still there and still an Album/EP: the dump was behind. */
  | { action: "keep" };

export function classifyLookup(oldMbid: string, result: LookupResult): VanishedAction {
  if (!result.found) return { action: "retire", reason: "deleted" };
  const body = (result.body ?? {}) as { id?: unknown; "primary-type"?: unknown };
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  if (!UUID_RE.test(id)) throw new Error(`Lookup for ${oldMbid} returned no valid id`);
  if (id !== oldMbid.toLowerCase()) return { action: "redirect", newMbid: id };
  const type = typeof body["primary-type"] === "string" ? body["primary-type"] : "";
  if (!(KEPT_PRIMARY_TYPES as readonly string[]).includes(type)) return { action: "retire", reason: "not_album" };
  return { action: "keep" };
}
