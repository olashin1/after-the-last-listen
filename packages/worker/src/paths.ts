import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
/** Downloaded MusicBrainz dumps (gitignored). */
export const CACHE_DIR = path.join(REPO_ROOT, ".cache", "musicbrainz");
