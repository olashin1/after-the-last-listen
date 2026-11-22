import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlbumCover } from "@/components/album-cover";
import { LogButton } from "@/components/log/log-dialog";
import { loadProfilePage, PrivateNotice, ProfileNav } from "@/components/profile-nav";
import { RatingStars, ShootingStarLabel } from "@/components/rating-stars";
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
      <h1 className="text-2xl font-semibold tracking-tight break-words">{isOwner ? "My Albums" : `${name}'s albums`}</h1>
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
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
        <p className="text-lg font-medium">No logs yet</p>
        {isOwner ? (
          <>
            <p className="text-sm text-zinc-500">Albums you log show up here, with your rating and Shooting Star.</p>
            <LogButton className="rounded-md bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700">
              Log your first album +
            </LogButton>
          </>
        ) : (
          <p className="text-sm text-zinc-500">@{username} hasn&apos;t logged any albums yet.</p>
        )}
      </div>
    );
  }

  const last = items.at(-1);
  return (
    <>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => {
          const rating = item.rating === null ? null : Number(item.rating);
          return (
            <li key={item.user_album_id}>
              <Link href={`/album/${item.album_id}`} className="group flex flex-col gap-1.5">
                <span className="block aspect-square w-full overflow-hidden rounded [&>*]:!h-full [&>*]:!w-full">
                  <AlbumCover mbid={item.mbid} title={item.title} size={200} />
                </span>
                <span className="text-sm font-medium leading-snug break-words group-hover:underline">{item.title}</span>
                <span className="-mt-1 text-xs text-zinc-500 break-words">{item.artist_credit || "Unknown artist"}</span>
                <RatingStars rating={rating} size={14} />
                {item.shooting_star_title && <ShootingStarLabel title={item.shooting_star_title} className="text-xs" />}
              </Link>
            </li>
          );
        })}
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
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading albums…</p>}>
        <Albums {...props} />
      </Suspense>
    </main>
  );
}
