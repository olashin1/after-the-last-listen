import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@atll/types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/**
 * Refreshes the Supabase auth session cookie on each request.
 * Route protection (redirecting signed-out users) is added with the auth pages, not here.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // No-cache headers from @supabase/ssr: stops CDNs serving one user's session cookie to another.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it validates the
  // token and triggers the refresh. Removing it can log users out at random.
  await supabase.auth.getClaims();

  return response;
}
