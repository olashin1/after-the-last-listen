import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/avatar";
import { debugToolsEnabled } from "@/lib/debug";
import { getCurrentProfile } from "@/lib/auth";

async function AccountLinks() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <>
        <Link href="/sign-in">Sign in</Link>
        <Link href="/sign-up" className="font-medium">Sign up</Link>
      </>
    );
  }

  return (
    <>
      <Link href={`/u/${profile.username}`} className="flex items-center gap-2">
        <Avatar path={profile.avatar_url} name={profile.display_name ?? profile.username} size={24} />
        @{profile.username}
      </Link>
      <Link href="/settings/profile">Settings</Link>
      <form action={signOut}>
        <button type="submit" className="cursor-pointer">Sign out</button>
      </form>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3 text-sm">
        <Link href="/" className="font-semibold">After the Last Listen</Link>
        <div className="flex items-center gap-4">
          {debugToolsEnabled() && (
            <Link href="/search" title="Debug search page (DEBUG_TOOLS=true)">Search (debug)</Link>
          )}
          <Suspense fallback={null}>
            <AccountLinks />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
