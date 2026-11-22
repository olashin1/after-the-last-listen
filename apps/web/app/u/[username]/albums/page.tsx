import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlbumTile } from "@/components/album-tile";
import { LogButton } from "@/components/log/log-dialog";
import { loadProfilePage, PrivateNotice, ProfileHeading, ProfileNav } from "@/components/profile-nav";
import { collectionCursor, getCollection } from "@/lib/collection";

export const metadata: Metadata = { title: "Albums" };

// My Albums (PRD §2, §3 Collection): every album the user has logged, once each, most recently
// listened first, with rating and Shooting Star. Private profiles show only to their owner (RLS in
// get_collection). Pages by cursor (?before=…).

async function Albums({ params, searchParams }: PageProps<"/u/[username]/albums">) {
  const { username } = await params;
  const { before } = await searchParams;
  const page = await loadProfilePage(username);
  if (!page) notFound();
  const { profile, isOwner, contentHidden } = page;
  const name = profile.display_name ?? profile.username;

  return (
    <>
      <ProfileHeading
        title={isOwner ? "My Albums" : `${name}'s albums`}
        username={profile.username}
        name={name}
        avatarPath={profile.avatar_url}
      />
      <ProfileNav username={profile.username} current="albums" />
      {contentHidden ? (
        <PrivateNotice />
      ) : (
        <Grid username={profile.username} isOwner={isOwner} cursor={typeof before === "string" ? before : undefined} />
      )}
    </>
  );
}

async function Grid({ username, isOwner, cursor }: { username: string; isOwner: boolean; cursor?: string }) {
  const { items, hasMore } = await getCollection(username, cursor);

  if (items.length === 0 && !cursor) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-plum-300 px-6 py-12 text-center dark:border-plum-700">
        <p className="text-lg font-medium">No logs yet</p>
        {isOwner ? (
          <>
            <p className="text-sm text-plum-500">Albums you log show up here, with your rating and Shooting Star.</p>
            <LogButton className="rounded-md bg-iris-600 px-4 py-2 font-medium text-white hover:bg-iris-700">
              Log your first album +
            </LogButton>
          </>
        ) : (
          <p className="text-sm text-plum-500">@{username} hasn&apos;t logged any albums yet.</p>
        )}
      </div>
    );
  }

  const last = items.at(-1);
  return (
    <>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <li key={item.user_album_id}>
            <AlbumTile item={item} />
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-sm">
        {cursor ? <Link href={`/u/${username}/albums`} className="underline">← Most recent</Link> : <span />}
        {hasMore && last && (
          <Link href={`/u/${username}/albums?before=${encodeURIComponent(collectionCursor(last))}`} className="underline">
            Older albums →
          </Link>
        )}
      </div>
    </>
  );
}

export default function AlbumsPage(props: PageProps<"/u/[username]/albums">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p className="text-sm text-plum-500">Loading albums…</p>}>
        <Albums {...props} />
      </Suspense>
    </main>
  );
}
