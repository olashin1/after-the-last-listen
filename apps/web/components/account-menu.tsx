"use client";

// The signed-in user's menu at the far right of the header: avatar and @username, opening a small
// menu with the less-used links, so the bar itself stays short (docs/decisions.md, design).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/(auth)/actions";

const itemClass =
  "block w-full px-3 py-2 text-left hover:bg-plum-100 focus-visible:bg-plum-100 focus-visible:outline-none dark:hover:bg-plum-800 dark:focus-visible:bg-plum-800";

export function AccountMenu({ username, avatar }: { username: string; avatar: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on a click outside or Escape (focus goes back to the button).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for @${username}`}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 hover:bg-plum-100 dark:hover:bg-plum-800"
      >
        {avatar}
        <span className="hidden sm:inline">@{username}</span>
        <span aria-hidden className="text-xs text-plum-500">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-plum-200 bg-white py-1 shadow-lg dark:border-plum-800 dark:bg-plum-900"
        >
          <Link role="menuitem" href={`/u/${username}`} onClick={close} className={itemClass}>Profile</Link>
          <Link role="menuitem" href={`/u/${username}/diary`} onClick={close} className={itemClass}>Diary</Link>
          <Link role="menuitem" href={`/u/${username}/listen-list`} onClick={close} className={itemClass}>Listen List</Link>
          <Link role="menuitem" href="/settings/profile" onClick={close} className={itemClass}>Settings</Link>
          <div className="my-1 border-t border-plum-200 dark:border-plum-800" />
          <form action={signOut}>
            <button role="menuitem" type="submit" className={`${itemClass} cursor-pointer`}>Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
