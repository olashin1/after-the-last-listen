import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * A profile and who's looking at it, for the profile's pages (/u/[username], /albums, /diary).
 * Null when there's no such user. contentHidden: private, and the viewer isn't the owner (RLS hides
 * the content anyway; this only picks the message).
 */
export async function loadProfilePage(username: string) {
  const supabase = await createClient();
  const [{ data: profile }, me] = await Promise.all([
    supabase.from("profiles").select("*").eq("username", username.toLowerCase()).maybeSingle(),
    getCurrentProfile(),
  ]);
  if (!profile) return null;
  const isOwner = me?.user_id === profile.user_id;
  return { profile, isOwner, contentHidden: profile.visibility === "private" && !isOwner };
}

/** A user page's heading with their profile picture, e.g. "My Albums" or "Tester's diary". */
export function ProfileHeading({ title, username, name, avatarPath }: { title: string; username: string; name: string; avatarPath: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <Link href={`/u/${username}`} aria-label={`@${username}'s profile`} className="shrink-0 rounded-full">
        <Avatar path={avatarPath} name={name} size={48} />
      </Link>
      <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{title}</h1>
    </div>
  );
}

const TABS = [
  { key: "profile", label: "Profile", path: "" },
  { key: "albums", label: "Albums", path: "/albums" },
  { key: "diary", label: "Diary", path: "/diary" },
] as const;

export function ProfileNav({ username, current }: { username: string; current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Profile" className="flex gap-4 border-b border-plum-200 text-sm dark:border-plum-800">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/u/${username}${tab.path}`}
          aria-current={tab.key === current ? "page" : undefined}
          className={`-mb-px border-b-2 pb-2 ${
            tab.key === current ? "border-iris-600 font-medium" : "border-transparent text-plum-500 hover:text-plum-900 dark:hover:text-plum-100"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function PrivateNotice() {
  return (
    <p className="rounded-md border border-plum-200 p-4 text-sm text-plum-500 dark:border-plum-800">
      This profile is private.
    </p>
  );
}
