import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@atll/types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/** Supabase client for Client Components. */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
