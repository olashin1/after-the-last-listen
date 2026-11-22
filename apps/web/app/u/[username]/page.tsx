import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlbumCover } from "@/components/album-cover";
import { AlbumTile } from "@/components/album-tile";
import { Avatar } from "@/components/avatar";
import { LogButton } from "@/components/log/log-dialog";
import { loadProfilePage, PrivateNotice, ProfileNav } from "@/components/profile-nav";
import { RatingStars, ShootingStarLabel } from "@/components/rating-stars";
import { type CollectionItem, getRecent } from "@/lib/collection";

// Profile page: the card (always public, docs/decisions.md), then the user's 3 most recently
// listened albums and their 3 most recent reviews (decided with the user, 2026-11-22). Both come
// from get_collection(), so RLS hides them on private profiles for everyone but the owner.

async function Profile({ params }: { params: PageProps<"/u/[username]">["params"] }) {
  const { username } = await params;
  const page = await loadProfilePage(username);
  if (!page) notFound();
  const { profile, isOwner, contentHidden } = page;
  const name = profile.display_name ?? profile.username;

  return (
    <>
      <header className="flex items-center gap-4">
        <Avatar path={profile.avatar_url} name={name} size={80} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight break-words">{name}</h1>
          <p className="text-plum-500">@{profile.username}</p>
        </div>
      </header>
      <ProfileNav username={profile.username} current="profile" />
      {profile.bio && <p className="whitespace-pre-line">{profile.bio}</p>}
      {isOwner && (
        <p className="text-sm">
          <Link href="/settings/profile" className="underline">Edit profile</Link>
          {profile.visibility === "private" && <span className="text-plum-500"> · Your profile is private.</span>}
        </p>
      )}
      {contentHidden ? (
        <PrivateNotice />
      ) : (
        <Suspense fallback={<p className="text-sm text-plum-500">Loading albums…</p>}>
          <Recent username={profile.username} isOwner={isOwner} />
        </Suspense>
      )}
    </>
  );
}

function SectionHeading({ id, title, href, linkLabel }: { id: string; title: string; href: string; linkLabel: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-plum-200 pb-2 dark:border-plum-800">
      <h2 id={id} className="text-sm font-semibold tracking-wide text-plum-600 uppercase dark:text-plum-300">{title}</h2>
      <Link href={href} className="text-sm text-plum-500 hover:underline">{linkLabel}</Link>
    </div>
  );
}

async function Recent({ username, isOwner }: { username: string; isOwner: boolean }) {
  const { recent, reviewed } = await getRecent(username);

  if (recent.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center gap-4 rounded-lg border border-dashed border-plum-300 px-6 py-12 text-center dark:border-plum-700">
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

  return (
    <>
      <section aria-labelledby="recent-heading" className="mt-4 flex flex-col gap-4">
        <SectionHeading id="recent-heading" title="Recently listened" href={`/u/${username}/albums`} linkLabel="All albums →" />
        <ul className="grid grid-cols-3 gap-4 sm:gap-6">
          {recent.map((item) => (
            <li key={item.user_album_id}>
              <AlbumTile item={item} />
            </li>
          ))}
        </ul>
      </section>

      {reviewed.length > 0 && (
        <section aria-labelledby="reviews-heading" className="mt-4 flex flex-col gap-2">
          <SectionHeading id="reviews-heading" title="Recent reviews" href={`/u/${username}/diary`} linkLabel="Diary →" />
          <ul className="flex flex-col divide-y divide-plum-200 dark:divide-plum-800">
            {reviewed.map((item) => (
              <li key={item.user_album_id}>
                <ReviewCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ReviewCard({ item }: { item: CollectionItem }) {
  const rating = item.rating === null ? null : Number(item.rating);
  return (
    <Link href={`/album/${item.album_id}`} className="group flex gap-4 py-4">
      <AlbumCover mbid={item.mbid} title={item.title} size={72} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="text-lg font-medium break-words group-hover:underline">{item.title}</span>
          <RatingStars rating={rating} size={21} />
        </div>
        <span className="-mt-1 text-plum-500 break-words">{item.artist_credit || "Unknown artist"}</span>
        <p className="my-1 line-clamp-4 whitespace-pre-line break-words">{item.review}</p>
        {item.shooting_star_title && <ShootingStarLabel title={item.shooting_star_title} className="text-sm" />}
      </div>
    </Link>
  );
}

export default function ProfilePage(props: PageProps<"/u/[username]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p className="text-sm text-plum-500">Loading…</p>}>
        <Profile params={props.params} />
      </Suspense>
    </main>
  );
}
