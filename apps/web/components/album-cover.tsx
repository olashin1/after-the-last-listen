"use client";

import { useEffect, useRef, useState } from "react";

// Cover Art Archive serves a release group's front cover at a fixed URL (redirects to archive.org),
// so we store nothing. https://musicbrainz.org/doc/Cover_Art_Archive/API (checked 2026-11-21).
// Many albums have no art (404), so fall back to a placeholder.
export function coverArtUrl(mbid: string, size: 250 | 500 | 1200) {
  return `https://coverartarchive.org/release-group/${mbid}/front-${size}`;
}

/**
 * Square album cover. Plain <img>: the images are already sized by the archive, and next/image
 * would need a remotePatterns entry for archive.org's changing hosts. Revisit at launch.
 */
export function AlbumCover({
  mbid,
  title,
  size,
  source = size <= 250 ? 250 : 500,
  priority = false,
}: {
  mbid: string;
  title: string;
  size: number;
  source?: 250 | 500 | 1200;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const box = { width: size, height: size };

  // A 404 that happens before hydration never reaches onError, so check once after mounting.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <span
        role="img"
        aria-label={`No cover for ${title}`}
        style={box}
        className="flex shrink-0 items-center justify-center rounded bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
      >
        <svg viewBox="0 0 24 24" width={size * 0.4} height={size * 0.4} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see comment above
    <img
      ref={imgRef}
      src={coverArtUrl(mbid, source)}
      alt={`Cover of ${title}`}
      width={size}
      height={size}
      style={box}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className="shrink-0 rounded bg-zinc-200 object-cover dark:bg-zinc-800"
    />
  );
}
