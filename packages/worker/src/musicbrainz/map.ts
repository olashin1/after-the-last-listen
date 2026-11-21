// The release-group mapper lives in the shared package so the web app's live search fallback maps
// API results the same way the import maps the dump.
export {
  KEPT_PRIMARY_TYPES,
  mapReleaseGroup,
  type MapResult,
  type MappedAlbum,
  type MappedCredit,
  type SkipReason,
} from "@atll/musicbrainz";
