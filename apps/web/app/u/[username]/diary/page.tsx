import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlbumCover } from "@/components/album-cover";
import { LogButton } from "@/components/log/log-dialog";
import { loadProfilePage, PrivateNotice, ProfileHeading, ProfileNav } from "@/components/profile-nav";
import { RatingStars, ShootingStarLabel } from "@/components/rating-stars";
import { diaryCursor, getDiary } from "@/lib/collection";
import { formatListenDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Diary" };

// Diary (PRD §2, §3; Phase 3 basic version): every listen newest first, same-day repeats included,
// with the album's rating and Shooting Star, and its review on the album's most recent listen. Filters, Log Again notes and editing listens are Phase 4.

async function Diary({ params, searchParams }: PageProps<"/u/[username]/diary">) {
  const { username } = await params;
  const { before } = await searchParams;
  const page = await loadProfilePage(username);
  if (!page) notFound();
  const { profile, isOwner, contentHidden } = page;
  const name = profile.display_name ?? profile.username;

  return (
    <>
      <ProfileHeading
        title={isOwner ? "My Diary" : `${name}'s diary`}
        username={profile.username}
        name={name}
        avatarPath={profile.avatar_url}
      />
      <ProfileNav username={profile.username} current="diary" />
      {contentHidden ? (
        <PrivateNotice />
      ) : (
        <Rows username={profile.username} isOwner={isOwner} cursor={typeof before === "string" ? before : undefined} />
      )}
    </>
  );
}

async function Rows({ username, isOwner, cursor }: { username: string; isOwner: boolean; cursor?: string }) {
  const { items, hasMore } = await getDiary(username, cursor);

  if (items.length === 0 && !cursor) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-plum-300 px-6 py-12 text-center dark:border-plum-700">
        <p className="text-lg font-medium">No logs yet</p>
        {isOwner ? (
          <LogButton className="rounded-md bg-iris-600 px-4 py-2 font-medium text-white hover:bg-iris-700">
            Log your first album +
          </LogButton>
        ) : (
          <p className="text-sm text-plum-500">@{username} hasn&apos;t logged any albums yet.</p>
        )}
      </div>
    );
  }

  const last = items.at(-1);
  return (
    <>
      <ol className="flex flex-col divide-y divide-plum-200 dark:divide-plum-800">
        {items.map((item) => (
          <li key={item.listen_id} className={`flex gap-5 py-4 ${item.review ? "items-start" : "items-center"}`}>
            <time dateTime={item.listened_on} className="w-28 shrink-0 text-plum-500 tabular-nums">
              {formatListenDate(item.listened_on)}
            </time>
            <Link href={`/album/${item.album_id}`} className="shrink-0">
              <AlbumCover mbid={item.mbid} title={item.title} size={72} />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={`/album/${item.album_id}`} className="text-lg font-medium break-words hover:underline">{item.title}</Link>
              <span className="-mt-1 text-plum-500 break-words">{item.artist_credit || "Unknown artist"}</span>
              {item.review && <p className="my-1 whitespace-pre-line break-words">{item.review}</p>}
              {item.shooting_star_title && <ShootingStarLabel title={item.shooting_star_title} />}
            </div>
            <RatingStars rating={item.rating === null ? null : Number(item.rating)} size={26} />
          </li>
        ))}
      </ol>
      <div className="flex justify-between text-sm">
        {cursor ? <Link href={`/u/${username}/diary`} className="underline">← Most recent</Link> : <span />}
        {hasMore && last && (
          <Link href={`/u/${username}/diary?before=${encodeURIComponent(diaryCursor(last))}`} className="underline">
            Older listens →
          </Link>
        )}
      </div>
    </>
  );
}

export default function DiaryPage(props: PageProps<"/u/[username]/diary">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p className="text-sm text-plum-500">Loading diary…</p>}>
        <Diary {...props} />
      </Suspense>
    </main>
  );
}
