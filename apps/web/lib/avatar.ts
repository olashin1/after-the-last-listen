import { supabaseUrl } from "@/lib/env";

// Avatar settings shared by the upload form and display. The bucket (avatars migration)
// enforces the stored-file limits; these are only for early, friendly checks.
export const AVATAR_BUCKET = "avatars";
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_PIXELS = 512;
/** Originals above this are refused before decoding; they're resized well below the 2 MB limit. */
export const AVATAR_MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Public URL for a stored avatar path (`{user_id}/{file}`), or null for no avatar. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${encoded}`;
}
