import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlbumCover } from "@/components/album-cover";
import { ListenListButton } from "@/components/listen-list-button";
import { LogButton } from "@/components/log/log-dialog";
import { loadProfilePage, PrivateNotice, ProfileHeading, ProfileNav } from "@/components/profile-nav";
import { getListenList, listenListCursor } from "@/lib/listen-list";

export const metadata: Metadata = { title: "Listen List" };

// Listen List (docs/decisions.md): albums the user wants to listen to, most recently added first.
// Same visibility as their albums (RLS in get_listen_list). The owner can log an album straight from
// here (which takes it off the list) or remove it. Cards have a fixed text area (title up to 2 lines,
// artist 1 line, full text on hover) so the Log / Remove buttons line up across a row.

async function ListenList({ params, searchParams }: PageProps<"/u/[username]/listen-list">) {
  const { username } = await params;
  const { before } = await searchParams;
  const page = await loadProfilePage(username);
  if (!page) notFound();
  const { profile, isOwner, contentHidden } = page;
  const name = profile.display_name ?? profile.username;

  return (
    <>
      <ProfileHeading
        title={isOwner ? "My Listen List" : `${name}'s Listen List`}
        username={profile.username}
        name={name}
        avatarPath={profile.avatar_url}
      />
      <ProfileNav username={profile.username} current="listen-list" />
      {contentHidden ? (
        <PrivateNotice />
      ) : (
        <Grid username={profile.username} isOwner={isOwner} cursor={typeof before === "string" ? before : undefined} />
      )}
    </>
  );
}

async function Grid({ username, isOwner, cursor }: { username: string; isOwner: boolean; cursor?: string }) {
  const { items, hasMore } = await getListenList(username, cursor);

  if (items.length === 0 && !cursor) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-plum-300 px-6 py-12 text-center dark:border-plum-700">
        <p className="text-lg font-medium">{isOwner ? "Your Listen List is empty" : "Nothing here yet"}</p>
        <p className="text-sm text-plum-500">
          {isOwner ? (
            <>Add albums you want to hear with the <span className="font-medium">+ Listen List</span> button on their pages.</>
          ) : (
            <>@{username} hasn&apos;t added any albums yet.</>
          )}
        </p>
        {isOwner && <Link href="/search" className="text-sm underline">Search albums</Link>}
      </div>
    );
  }

  const last = items.at(-1);
  return (
    <>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <li key={item.listen_list_id} className="flex h-full flex-col gap-2">
            <Link href={`/album/${item.album_id}`} title={`${item.title} · ${item.artist_credit || "Unknown artist"}`} className="group flex flex-1 flex-col gap-1.5">
              <span className="block aspect-square w-full overflow-hidden rounded [&>*]:!h-full [&>*]:!w-full">
                <AlbumCover mbid={item.mbid} title={item.title} size={200} />
              </span>
              <span className="line-clamp-2 min-h-[2.75em] text-sm font-medium leading-snug break-words group-hover:underline">{item.title}</span>
              <span className="-mt-1 truncate text-xs text-plum-500">
                {item.artist_credit || "Unknown artist"}
                {item.first_release_date && ` · ${item.first_release_date.slice(0, 4)}`}
              </span>
            </Link>
            {isOwner && (
              <div className="mt-auto flex items-center gap-3">
                <LogButton albumId={item.album_id} className="rounded-md bg-iris-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-iris-700">
                  Log +
                </LogButton>
                <ListenListButton albumId={item.album_id} onList variant="remove" />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-sm">
        {cursor ? <Link href={`/u/${username}/listen-list`} className="underline">← Most recent</Link> : <span />}
        {hasMore && last && (
          <Link href={`/u/${username}/listen-list?before=${encodeURIComponent(listenListCursor(last))}`} className="underline">
            Older →
          </Link>
        )}
      </div>
    </>
  );
}

export default function ListenListPage(props: PageProps<"/u/[username]/listen-list">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p className="text-sm text-plum-500">Loading Listen List…</p>}>
        <ListenList {...props} />
      </Suspense>
    </main>
  );
}
