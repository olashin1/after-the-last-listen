import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/avatar";
import { LogButton } from "@/components/log/log-dialog";
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
      <Link href={`/u/${profile.username}/albums`}>My Albums</Link>
      <Link href={`/u/${profile.username}`} className="flex items-center gap-2">
        <Avatar path={profile.avatar_url} name={profile.display_name ?? profile.username} size={24} />
        @{profile.username}
      </Link>
      <Link href="/settings/profile">Settings</Link>
      <form action={signOut}>
        <button type="submit" className="cursor-pointer">Sign out</button>
      </form>
      {/* Rightmost: logging is the main action (docs/decisions.md, logging UI). */}
      <LogButton>Log +</LogButton>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3 text-sm">
        <Link href="/" className="font-semibold">After the Last Listen</Link>
        <div className="flex items-center gap-4">
          <form action="/search" role="search" className="hidden sm:block">
            <input
              name="q"
              type="search"
              placeholder="Search albums"
              aria-label="Search albums"
              className="w-48 rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
            />
          </form>
          <Link href="/search" className="sm:hidden">Search</Link>
          <Suspense fallback={null}>
            <AccountLinks />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
