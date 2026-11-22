"use client";

// Add an album to, or take it off, your Listen List. The label flips straight away and goes back
// if the save fails.

import { useOptimistic, useState, useTransition } from "react";
import { setOnListenList } from "@/app/listen-list/actions";

export function ListenListButton({
  albumId,
  onList,
  variant = "toggle",
}: {
  albumId: number;
  onList: boolean;
  /** "toggle": "+ Listen List" / "✓ On your Listen List". "remove": a plain "Remove" for the list page. */
  variant?: "toggle" | "remove";
}) {
  const [optimistic, setOptimistic] = useOptimistic(onList);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !optimistic;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result = await setOnListenList(albumId, next);
      if (!result.ok) setError(result.error);
    });
  }

  if (variant === "remove") {
    return (
      <span className="flex flex-col">
        <button type="button" onClick={toggle} disabled={pending} className="cursor-pointer text-sm text-plum-500 underline disabled:opacity-60">
          {pending ? "Removing…" : "Remove"}
        </button>
        {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <span className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimistic}
        className={`cursor-pointer rounded-md px-5 py-2 font-medium ${
          optimistic
            ? "border border-iris-400 text-iris-700 hover:bg-iris-50 dark:border-iris-500 dark:text-iris-300 dark:hover:bg-iris-950"
            : "border border-plum-300 hover:bg-plum-100 dark:border-plum-700 dark:hover:bg-plum-800"
        }`}
      >
        {optimistic ? "✓ On your Listen List" : "+ Listen List"}
      </button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
