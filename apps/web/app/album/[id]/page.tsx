import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { AlbumCover } from "@/components/album-cover";
import { LogButton } from "@/components/log/log-dialog";
import { RatingStars, ShootingStarLabel } from "@/components/rating-stars";
import { type Album as AlbumRow, getAlbum, getTracklist } from "@/lib/album";
import { getCurrentProfile } from "@/lib/auth";
import { getUserAlbum } from "@/lib/collection";
import { formatListenDate } from "@/lib/dates";
import { formatDuration } from "@atll/musicbrainz";

// Album page (PRD Phase 2 "find and inspect an album"): cover, title, then the canonical release's
// tracklist from the first track to the last. Signed in, its Log button opens the Log dialog on this
// album, and "Your log" shows the user's rating, review and Shooting Star (highlighted in the tracklist).
// The tracklist streams in its own Suspense boundary: loading it may wait on MusicBrainz (with
// retries), and that must never hold up the rest of the page.

function parseId(raw: string): number | null {
  return /^\d{1,18}$/.test(raw) ? Number(raw) : null;
}

async function Album({ params }: { params: PageProps<"/album/[id]">["params"] }) {
  const id = parseId((await params).id);
  if (id === null) notFound();
  const album = await getAlbum(id);
  if (!album) notFound();
  if ("mergedInto" in album) permanentRedirect(`/album/${album.mergedInto}`);

  const types = [album.primary_type, ...album.secondary_types].join(" · ");
  const year = album.first_release_date?.slice(0, 4);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col items-center gap-4 text-center">
        <AlbumCover mbid={album.mbid} title={album.title} size={320} source={500} priority />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight break-words">{album.title}</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 break-words">{album.artist_credit || "Unknown artist"}</p>
          <p className="text-sm text-zinc-500">{[year, types].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <Suspense fallback={null}>
        <YourLog album={album} />
      </Suspense>

      <Suspense fallback={<p className="text-sm text-zinc-500">Loading tracklist…</p>}>
        <Tracklist album={album} />
      </Suspense>

      {album.retired && (
        <p className="text-sm text-zinc-500">This album was removed from MusicBrainz. It&apos;s kept here for anyone who logged it.</p>
      )}
      <p className="text-xs text-zinc-400">
        Album data from <a href={`https://musicbrainz.org/release-group/${album.mbid}`} className="underline">MusicBrainz</a>
        {" "}· cover from the <a href="https://coverartarchive.org/" className="underline">Cover Art Archive</a>
      </p>
    </article>
  );
}

/** The Log button, and the signed-in user's entry for this album when they've logged it. */
async function YourLog({ album }: { album: AlbumRow }) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return (
      <p className="text-center text-sm">
        <Link href={`/sign-in?next=/album/${album.id}`} className="font-medium text-violet-700 underline dark:text-violet-400">
          Sign in to log this album
        </Link>
      </p>
    );
  }

  const entry = await getUserAlbum(album.id);
  if (!entry) {
    return (
      <div className="flex justify-center">
        <LogButton albumId={album.id} className="rounded-md bg-violet-600 px-5 py-2 font-medium text-white hover:bg-violet-700">
          Log +
        </LogButton>
      </div>
    );
  }

  const rating = entry.rating === null ? null : Number(entry.rating);
  return (
    <section aria-labelledby="your-log-heading" className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <h2 id="your-log-heading" className="font-semibold">Your log</h2>
        <div className="flex items-center gap-3">
          <LogButton albumId={album.id} mode="edit" className="text-sm text-zinc-600 underline dark:text-zinc-400">
            Edit
          </LogButton>
          <LogButton albumId={album.id} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700">
            Log again +
          </LogButton>
        </div>
      </div>
      {rating !== null ? <RatingStars rating={rating} size={20} /> : <p className="text-sm text-zinc-500">Unrated</p>}
      {entry.shooting_star_title && <ShootingStarLabel title={entry.shooting_star_title} />}
      {entry.review && <p className="whitespace-pre-line break-words">{entry.review}</p>}
      <p className="text-xs text-zinc-500">
        {entry.listen_count === 1
          ? `Listened ${formatListenDate(entry.first_listened_on)}`
          : `Listened ${entry.listen_count} times · first ${formatListenDate(entry.first_listened_on)} · last ${formatListenDate(entry.last_listened_on)}`}
      </p>
    </section>
  );
}

async function Tracklist({ album }: { album: AlbumRow }) {
  const [{ tracks, status }, entry] = await Promise.all([getTracklist(album), getUserAlbum(album.id)]);
  const star = entry?.shooting_star_recording_mbid ?? null;
  const discs = new Set(tracks.map((t) => t.disc_number)).size;
  const totalMs = tracks.every((t) => t.length_ms !== null) ? tracks.reduce((sum, t) => sum + (t.length_ms ?? 0), 0) : null;

  return (
    <section aria-labelledby="tracklist-heading" className="flex flex-col gap-2">
      <h2 id="tracklist-heading" className="sr-only">Tracklist</h2>
      {tracks.length > 0 && (
        <p className="text-sm text-zinc-500">
          {[`${tracks.length} track${tracks.length === 1 ? "" : "s"}`, formatDuration(totalMs) || null].filter(Boolean).join(" · ")}
        </p>
      )}
      {status === "no_release" && (
        <p className="text-sm text-zinc-500">No tracklist for this album yet.</p>
      )}
      {status === "unavailable" && (
        <p className="text-sm text-zinc-500">We couldn&apos;t load the tracklist from MusicBrainz. Try again in a moment.</p>
      )}
      {tracks.length > 0 && (
        <ol className="flex flex-col">
          {tracks.map((t, i) => {
            const newDisc = discs > 1 && (i === 0 || tracks[i - 1]!.disc_number !== t.disc_number);
            return (
              <li key={`${t.disc_number}-${t.position}`} className="flex flex-col">
                {newDisc && (
                  <span className="mt-4 mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 first:mt-0">
                    Disc {t.disc_number}
                  </span>
                )}
                <span
                  className={`flex items-baseline gap-3 border-b border-zinc-200 py-2 dark:border-zinc-800 ${
                    t.recording_mbid === star ? "-mx-2 rounded bg-amber-50 px-2 dark:bg-amber-950/30" : ""
                  }`}
                >
                  <span className="w-6 shrink-0 text-right text-sm text-zinc-400 tabular-nums">{t.position}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {t.title}
                    {t.recording_mbid === star && (
                      <span className="ml-2 text-amber-600 dark:text-amber-400">
                        <span aria-hidden>★</span>
                        <span className="sr-only">(your Shooting Star)</span>
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm text-zinc-500 tabular-nums">{formatDuration(t.length_ms)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default function AlbumPage(props: PageProps<"/album/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading album…</p>}>
        <Album params={props.params} />
      </Suspense>
    </main>
  );
}
