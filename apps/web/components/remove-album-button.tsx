"use client";

// "Remove" for an album in your collection (PRD §5): asks first, saying how many listens go, then
// calls remove_user_album(). A native <dialog> (focus trap, Esc to cancel), not window.confirm.

import { useRef, useState, useTransition } from "react";
import { removeAlbum } from "@/app/listen-list/actions";

export function RemoveAlbumButton({ albumId, title, listenCount }: { albumId: number; title: string; listenCount: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeAlbum(albumId);
      if (result.ok) dialogRef.current?.close();
      else setError(result.error);
    });
  }

  const listens = `${listenCount} listen${listenCount === 1 ? "" : "s"}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          dialogRef.current?.showModal();
        }}
        className="cursor-pointer text-sm text-plum-600 underline dark:text-plum-400"
      >
        Remove
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`remove-${albumId}-title`}
        onClick={(e) => e.target === e.currentTarget && !pending && dialogRef.current?.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-white p-0 text-plum-900 shadow-xl backdrop:bg-plum-950/60 dark:bg-plum-900 dark:text-plum-100"
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 id={`remove-${albumId}-title`} className="text-lg font-semibold">
            Remove <span className="break-words">{title}</span> from your albums?
          </h2>
          <p className="text-plum-600 dark:text-plum-300">
            This deletes {listens} from your diary, plus your rating, review and Shooting Star. This can&apos;t be undone.
          </p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
              className="rounded-md border border-plum-300 px-4 py-2 font-medium hover:bg-plum-100 dark:border-plum-700 dark:hover:bg-plum-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemove}
              disabled={pending}
              className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
