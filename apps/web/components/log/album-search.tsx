"use client";

import { useEffect, useRef, useState } from "react";
import { liveSearchForLog, searchForLog, type LogSearchResult } from "@/app/log/actions";
import { AlbumCover } from "@/components/album-cover";
import { inputClass } from "@/components/form";

const DEBOUNCE_MS = 300;

type State = {
  query: string;
  results: LogSearchResult[];
  status: "idle" | "searching" | "done" | "error";
  live: "idle" | "checking" | "done";
  error?: string;
};

/** Debounced album search (PRD §5). Weak local results also ask MusicBrainz, as on /search. */
export function AlbumSearch({ onPick }: { onPick: (albumId: number) => void }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ query: "", results: [], status: "idle", live: "idle" });
  // Only the latest query's answers are shown.
  const latest = useRef("");

  useEffect(() => {
    const query = q.trim();
    latest.current = query;
    if (query.length < 2) return;

    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, status: "searching" }));
      const local = await searchForLog(query);
      if (latest.current !== query) return;
      setState({
        query,
        results: local.results,
        status: local.error ? "error" : "done",
        live: local.weak ? "checking" : "idle",
        error: local.error,
      });
      if (!local.weak) return;

      const live = await liveSearchForLog(query, local.results.map((r) => r.id));
      if (latest.current !== query) return;
      setState((s) => ({ ...s, results: [...s.results, ...live], live: "done" }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const query = q.trim();
  const showing = query.length >= 2 && state.query === query;

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search for an album or artist"
        aria-label="Search albums"
        autoFocus
        className={`${inputClass} w-full`}
      />
      <p className="text-sm text-plum-500" aria-live="polite">
        {query.length < 2
          ? "Type at least two letters."
          : state.status === "searching" || !showing
            ? "Searching…"
            : state.error
              ? state.error
              : state.results.length === 0 && state.live !== "checking"
                ? "No albums found."
                : state.live === "checking"
                  ? "Checking MusicBrainz for new releases…"
                  : null}
      </p>
      {showing && state.results.length > 0 && (
        <ul className="flex flex-col divide-y divide-plum-200 dark:divide-plum-800">
          {state.results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r.id)}
                className="flex w-full items-center gap-3 rounded py-2 text-left hover:bg-plum-50 focus-visible:bg-plum-50 dark:hover:bg-plum-800 dark:focus-visible:bg-plum-800"
              >
                <AlbumCover mbid={r.mbid} title={r.title} size={44} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium break-words">{r.title}</span>
                  <span className="text-sm text-plum-500 break-words">
                    {r.artist}
                    {r.detail && ` · ${r.detail}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
