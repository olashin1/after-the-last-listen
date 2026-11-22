"use client";

// The Log dialog (docs/decisions.md, Phase 3 logging UI): one native <dialog> for the whole app,
// mounted in the root layout. The header's "Log +" opens it on a search; an album page's Log
// button opens it straight on that album's form; "Edit" opens the form without a date (no new
// listen). showModal() gives focus trapping, Esc to close and an inert background.

import Link from "next/link";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlbumSearch } from "./album-search";
import { LogForm } from "./log-form";

export type OpenOptions = { albumId?: number; mode?: "log" | "edit" };

type View =
  | { step: "search" }
  | { step: "form"; albumId: number; mode: "log" | "edit"; fromSearch: boolean }
  | { step: "done"; albumId: number; title: string; mode: "log" | "edit" };

const LogDialogContext = createContext<{ open: (options?: OpenOptions) => void } | null>(null);

export function useLogDialog() {
  const ctx = useContext(LogDialogContext);
  if (!ctx) throw new Error("useLogDialog must be used inside LogDialogProvider");
  return ctx;
}

export function LogDialogProvider({ children }: { children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View | null>(null);
  // A new key per opening resets the search and form state.
  const [session, setSession] = useState(0);

  const open = useCallback((options: OpenOptions = {}) => {
    setSession((s) => s + 1);
    setView(
      options.albumId === undefined
        ? { step: "search" }
        : { step: "form", albumId: options.albumId, mode: options.mode ?? "log", fromSearch: false },
    );
    dialogRef.current?.showModal();
  }, []);

  const close = useCallback(() => dialogRef.current?.close(), []);

  const title =
    view?.step === "search" ? "Log an album" : view?.step === "form" && view.mode === "edit" ? "Edit your log" : view?.step === "done" ? "Saved" : "Log";

  return (
    <LogDialogContext.Provider value={{ open }}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="log-dialog-title"
        onClose={() => setView(null)}
        // Clicking the backdrop (the dialog element itself, outside its content) closes it.
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
            <h2 id="log-dialog-title" className="font-semibold">{title}</h2>
            <button type="button" onClick={close} aria-label="Close" className="rounded p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">
            {view?.step === "search" && (
              <AlbumSearch key={session} onPick={(albumId) => setView({ step: "form", albumId, mode: "log", fromSearch: true })} />
            )}
            {view?.step === "form" && (
              <LogForm
                key={`${session}-${view.albumId}-${view.mode}`}
                albumId={view.albumId}
                mode={view.mode}
                onBack={view.fromSearch ? () => setView({ step: "search" }) : undefined}
                onSaved={(savedTitle) => setView({ step: "done", albumId: view.albumId, title: savedTitle, mode: view.mode })}
              />
            )}
            {view?.step === "done" && (
              <div className="flex flex-col items-start gap-4">
                <p role="status">
                  {view.mode === "edit" ? "Saved your changes to " : "Logged "}
                  <span className="font-medium">{view.title}</span>.
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Link href={`/album/${view.albumId}`} onClick={close} className="underline">View album</Link>
                  <Link href="/albums" onClick={close} className="underline">My Albums</Link>
                  <Link href="/diary" onClick={close} className="underline">Diary</Link>
                </div>
                <button type="button" onClick={close} className="rounded-md bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </LogDialogContext.Provider>
  );
}

/** A button that opens the Log dialog. Without albumId it starts on the search. */
export function LogButton({
  albumId,
  mode,
  className = "rounded-md bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-700",
  children,
}: OpenOptions & { className?: string; children: React.ReactNode }) {
  const { open } = useLogDialog();
  return (
    <button type="button" onClick={() => open({ albumId, mode })} className={`cursor-pointer ${className}`}>
      {children}
    </button>
  );
}
