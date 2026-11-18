import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function Profile({ params }: { params: PageProps<"/u/[username]">["params"] }) {
  const { username } = await params;
  const supabase = await createClient();
  const [{ data: profile }, me] = await Promise.all([
    supabase.from("profiles").select("*").eq("username", username.toLowerCase()).maybeSingle(),
    getCurrentProfile(),
  ]);
  if (!profile) notFound();

  const isOwner = me?.user_id === profile.user_id;
  // The card is always visible (docs/decisions.md). Collection and diary will check can_view_user_content().
  const contentHidden = profile.visibility === "private" && !isOwner;

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{profile.display_name ?? profile.username}</h1>
        <p className="text-zinc-500">@{profile.username}</p>
      </header>
      {profile.bio && <p className="whitespace-pre-line">{profile.bio}</p>}
      {isOwner && (
        <p className="text-sm">
          <Link href="/settings/profile" className="underline">Edit profile</Link>
          {profile.visibility === "private" && <span className="text-zinc-500"> · Your profile is private.</span>}
        </p>
      )}
      {contentHidden && (
        <p className="rounded-md border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
          This profile is private.
        </p>
      )}
    </>
  );
}

export default function ProfilePage(props: PageProps<"/u/[username]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Profile params={props.params} />
      </Suspense>
    </main>
  );
}
