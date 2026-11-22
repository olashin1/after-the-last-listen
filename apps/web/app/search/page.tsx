import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlbumCover } from "@/components/album-cover";
import { inputClass } from "@/components/form";
import { debugToolsEnabled } from "@/lib/debug";
import { isWeak, liveFallback, searchAlbums, type SearchResult } from "@/lib/search";

export const metadata: Metadata = { title: "Search" };

// Album search (PRD Phase 2 "find and inspect an album"). Local results render right away; when
// they're weak, a MusicBrainz search for new releases streams in below them (lib/search.ts).
// With DEBUG_TOOLS=true each result also shows its ranking score and text match.

function readQuery(params: Awaited<PageProps<"/search">["searchParams"]>): string {
  return typeof params.q === "string" ? params.q.slice(0, 200) : "";
}

function ResultList({ albums, debug }: { albums: SearchResult[]; debug: boolean }) {
  return (
    <ol className="flex flex-col divide-y divide-plum-200 dark:divide-plum-800">
      {albums.map((album) => (
        <li key={album.id}>
          <Link
            href={`/album/${album.id}`}
            className="flex items-center gap-3 rounded py-2 hover:bg-plum-50 dark:hover:bg-plum-900"
          >
            <AlbumCover mbid={album.mbid} title={album.title} size={48} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium break-words">{album.title}</span>
              <span className="text-sm text-plum-500 break-words">
                {album.artist_credit || "Unknown artist"}
                {album.first_release_date && ` · ${album.first_release_date.slice(0, 4)}`}
                {(album.primary_type !== "Album" || album.secondary_types.length > 0) &&
                  ` · ${[album.primary_type, ...album.secondary_types].join(" + ")}`}
              </span>
            </span>
            {debug && (
              <span className="shrink-0 font-mono text-xs text-plum-400 tabular-nums" title="Ranking score / text match">
                {album.score.toFixed(3)} / {album.match.toFixed(2)}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ol>
  );
}

async function LiveResults({ q, shown }: { q: string; shown: number[] }) {
  const albums = await liveFallback(q, new Set(shown));
  if (albums.length === 0) return null;
  return (
    <section aria-labelledby="live-heading" className="flex flex-col gap-2">
      <h2 id="live-heading" className="text-sm font-medium text-plum-500">New on MusicBrainz</h2>
      <ResultList albums={albums} debug={debugToolsEnabled()} />
    </section>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const q = readQuery(await searchParams);
  if (!q.trim()) return <p className="text-sm text-plum-500">Search for an album, an artist, or both.</p>;

  let search: Awaited<ReturnType<typeof searchAlbums>>;
  try {
    search = await searchAlbums(q);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return (
      <p role="alert" className="text-sm text-red-600">
        Search isn&apos;t working right now. Try again in a moment.
      </p>
    );
  }
  const { results, ms } = search;
  const debug = debugToolsEnabled();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-plum-500" aria-live="polite">
          {results.length === 0 ? "No albums found in our catalog." : `${results.length} result${results.length === 1 ? "" : "s"}`}
          {debug && ` in ${ms} ms`}
        </p>
        {results.length > 0 && <ResultList albums={results} debug={debug} />}
      </div>
      {isWeak(results) && (
        <Suspense fallback={<p className="text-sm text-plum-500">Checking MusicBrainz for new releases…</p>}>
          <LiveResults q={q} shown={results.map((r) => r.id)} />
        </Suspense>
      )}
    </div>
  );
}

async function SearchBox({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const q = readQuery(await searchParams);
  return (
    <form action="/search" className="flex gap-2" role="search">
      <input
        name="q"
        type="search"
        defaultValue={q}
        placeholder="e.g. dark side of the moon, radiohead kid a"
        autoFocus
        aria-label="Search albums"
        className={`${inputClass} min-w-0 flex-1`}
      />
      <button type="submit" className="rounded-md bg-plum-900 px-4 py-2 font-medium text-white dark:bg-plum-100 dark:text-plum-900">
        Search
      </button>
    </form>
  );
}

export default function SearchPage(props: PageProps<"/search">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <Suspense fallback={null}>
        <SearchBox searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-plum-500">Searching…</p>}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
