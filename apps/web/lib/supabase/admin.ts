import { createClient } from "@supabase/supabase-js";
import type { Database } from "@atll/types";
import { supabaseUrl } from "@/lib/env";

/**
 * Service-role Supabase client. Server-only: it bypasses RLS, so never import this from a Client
 * Component. SUPABASE_SECRET_KEY has no NEXT_PUBLIC_ prefix, so Next never sends it to the browser.
 * Used only for catalog writes the service role owns: set_album_tracks, and the live search fallback
 * (live_search_due, add_live_albums).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing SUPABASE_SECRET_KEY. Add it to apps/web/.env.local (SECRET_KEY from `pnpm supabase status`).");
  }
  return createClient<Database>(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
