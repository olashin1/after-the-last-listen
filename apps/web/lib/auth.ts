import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Only allow same-site relative paths as post-auth redirects (prevents open redirects).
 * Anything else falls back to `fallback`.
 */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** The signed-in user's profile, or null when signed out. Cached for the duration of a request. */
export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  return profile;
});
