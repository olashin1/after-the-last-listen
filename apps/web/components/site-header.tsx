import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
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

  // Search, My Albums, Log +, then the account menu at the far right; Profile, Diary, Settings and
  // Sign out live in that menu (docs/decisions.md, design).
  return (
    <>
      <Link href={`/u/${profile.username}/albums`}>My Albums</Link>
      <LogButton>Log +</LogButton>
      <AccountMenu
        username={profile.username}
        avatar={<Avatar path={profile.avatar_url} name={profile.display_name ?? profile.username} size={28} />}
      />
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-plum-200 dark:border-plum-800">
      <nav className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3 text-sm">
        <Link href="/" className="font-semibold">After the Last Listen</Link>
        <div className="flex items-center gap-4">
          <form action="/search" role="search" className="hidden sm:block">
            <input
              name="q"
              type="search"
              placeholder="Search albums"
              aria-label="Search albums"
              className="w-48 rounded-md border border-plum-300 bg-transparent px-2 py-1 dark:border-plum-700"
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
