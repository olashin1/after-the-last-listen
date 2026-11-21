import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlbumCover } from "@/components/album-cover";
import { inputClass } from "@/components/form";
import { debugToolsEnabled } from "@/lib/debug";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Search (debug)" };

// Debug-only search page for trying search_albums() against the local catalog.
// With DEBUG_TOOLS off this route doesn't exist yet; the real album search page replaces it
// (Phase 2: find and inspect an album).

/** Runs the search and times it (outside the component, which must stay pure). */
async function timedSearch(q: string) {
  const supabase = await createClient();
  const started = performance.now();
  const { data, error } = await supabase.rpc("search_albums", { q, lim: 20 });
  return { data, error, ms: Math.round(performance.now() - started) };
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  if (!q.trim()) return <p className="text-sm text-zinc-500">Type an album, artist, or both.</p>;

  const { data, error, ms } = await timedSearch(q);

  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Search failed: {error?.message ?? "no data returned"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">
        {data.length} result{data.length === 1 ? "" : "s"} in {ms} ms
        {data.length === 0 && " (is the catalog imported? see packages/worker/README.md)"}
      </p>
      <ol className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {data.map((album, i) => (
          <li key={album.id}>
            <Link
              href={`/album/${album.id}`}
              className="flex items-center gap-3 rounded py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span className="w-6 shrink-0 text-right text-sm text-zinc-400 tabular-nums">{i + 1}</span>
              <AlbumCover mbid={album.mbid} title={album.title} size={48} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium break-words">{album.title}</span>
                <span className="text-sm text-zinc-500 break-words">
                  {album.artist_credit || "Unknown artist"}
                  {album.first_release_date && ` · ${album.first_release_date.slice(0, 4)}`}
                  {" · "}
                  {[album.primary_type, ...album.secondary_types].join(" + ")}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-zinc-400 tabular-nums" title="Ranking score">
                {album.score.toFixed(3)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function SearchBox({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  return (
    <form action="/search" className="flex gap-2">
      <input
        name="q"
        type="search"
        defaultValue={q}
        placeholder="e.g. dark side of the moon, radiohead kid a"
        autoFocus
        aria-label="Search albums"
        className={`${inputClass} min-w-0 flex-1`}
      />
      <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
        Search
      </button>
    </form>
  );
}

export default function SearchPage(props: PageProps<"/search">) {
  if (!debugToolsEnabled()) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-zinc-500">
          Debug page: calls <code>search_albums()</code> on the local catalog and shows each result&apos;s score.
        </p>
      </header>
      <Suspense fallback={null}>
        <SearchBox searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-zinc-500">Searching…</p>}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
