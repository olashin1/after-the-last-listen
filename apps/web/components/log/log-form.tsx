"use client";

import { useEffect, useState, useTransition } from "react";
import { getLogContext, logAlbum, updateEntry, type LogContext } from "@/app/log/actions";
import { AlbumCover } from "@/components/album-cover";
import { inputClass } from "@/components/form";
import { localIsoDate } from "@/lib/dates";
import { ShootingStarIcon } from "@/components/rating-stars";
import { RatingInput } from "./rating-input";

const REVIEW_MAX = 5000;

/**
 * The log form. Mode "log" adds a listen (log_album) and saves rating, review and Shooting Star;
 * mode "edit" only saves those (update_user_album). An album already in the collection opens
 * prefilled, so logging it again keeps what was there unless it's changed.
 */
export function LogForm({
  albumId,
  mode,
  onBack,
  onSaved,
}: {
  albumId: number;
  mode: "log" | "edit";
  onBack?: () => void;
  onSaved: (title: string) => void;
}) {
  const [context, setContext] = useState<LogContext | { error: string } | null>(null);

  useEffect(() => {
    let current = true;
    getLogContext(albumId).then(
      (c) => current && setContext(c),
      () => current && setContext({ error: "Something went wrong. Please try again." }),
    );
    return () => {
      current = false;
    };
  }, [albumId]);

  if (!context) return <p className="text-sm text-plum-500">Loading album…</p>;
  if ("error" in context) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-red-600">{context.error}</p>
        {onBack && <BackButton onClick={onBack} />}
      </div>
    );
  }
  return <Form context={context} mode={mode} onBack={onBack} onSaved={onSaved} />;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="self-start text-sm text-plum-500 underline">
      ← Back to search
    </button>
  );
}

function Form({
  context,
  mode,
  onBack,
  onSaved,
}: {
  context: LogContext;
  mode: "log" | "edit";
  onBack?: () => void;
  onSaved: (title: string) => void;
}) {
  const { album, entry, tracks, tracksStatus } = context;
  const [today] = useState(() => localIsoDate());
  // One id per form: a double tap or a retry of the same submit never adds a second listen.
  const [requestId] = useState(() => crypto.randomUUID());
  const [listenedOn, setListenedOn] = useState(today);
  const [rating, setRating] = useState<number | null>(entry?.rating ?? null);
  const [review, setReview] = useState(entry?.review ?? "");
  const [star, setStar] = useState<string | null>(entry?.shootingStarMbid ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The current pick stays selectable even if the stored tracklist no longer has it.
  const starMissing = star !== null && entry?.shootingStarMbid === star && !tracks.some((t) => t.recording_mbid === star);
  const discs = new Set(tracks.map((t) => t.disc_number)).size;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const values = { albumId: album.id, rating, review, shootingStarMbid: star };
      const result =
        mode === "edit" ? await updateEntry(values) : await logAlbum({ ...values, listenedOn, today, requestId });
      if (result.ok) onSaved(album.title);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {onBack && <BackButton onClick={onBack} />}
      <div className="flex items-center gap-3">
        <AlbumCover mbid={album.mbid} title={album.title} size={64} />
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold break-words">{album.title}</span>
          <span className="text-sm text-plum-500 break-words">
            {album.artist}
            {album.year && ` · ${album.year}`}
          </span>
          {entry && mode === "log" && (
            <span className="text-xs text-plum-500">
              In your albums · logged {entry.listenCount} time{entry.listenCount === 1 ? "" : "s"}. This adds another listen.
            </span>
          )}
        </div>
      </div>

      {mode === "log" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Listened on</span>
          <input
            type="date"
            required
            value={listenedOn}
            max={today}
            min="1900-01-01"
            onChange={(e) => setListenedOn(e.target.value)}
            className={`${inputClass} w-fit`}
          />
        </label>
      )}

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium" id="rating-label">Rating <span className="font-normal text-plum-500">(optional)</span></span>
        <RatingInput value={rating} onChange={setRating} />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Review <span className="font-normal text-plum-500">(optional)</span></span>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          maxLength={REVIEW_MAX}
          rows={4}
          className={inputClass}
        />
        {review.length > REVIEW_MAX - 500 && (
          <span className="text-xs text-plum-500">{review.length} / {REVIEW_MAX}</span>
        )}
      </label>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1 flex items-center gap-1.5 font-medium">
          <ShootingStarIcon />
          Shooting Star <span className="font-normal text-plum-500">(optional: your favorite track)</span>
        </legend>
        {tracks.length === 0 && !starMissing && (
          <p className="text-plum-500">
            {tracksStatus === "no_release"
              ? "There's no tracklist for this album yet."
              : "The tracklist isn't available right now."}{" "}
            You can add a Shooting Star later from the album page.
          </p>
        )}
        {(tracks.length > 0 || starMissing) && (
          <div className="flex max-h-64 flex-col overflow-y-auto rounded-md border border-plum-200 dark:border-plum-800">
            <StarOption checked={star === null} onChange={() => setStar(null)} label="None" />
            {starMissing && entry?.shootingStarTitle && (
              <StarOption checked onChange={() => setStar(entry.shootingStarMbid)} label={entry.shootingStarTitle} />
            )}
            {tracks.map((t) => (
              <StarOption
                key={`${t.disc_number}-${t.position}`}
                checked={star === t.recording_mbid}
                onChange={() => setStar(t.recording_mbid)}
                number={discs > 1 ? `${t.disc_number}.${t.position}` : String(t.position)}
                label={t.title}
              />
            ))}
          </div>
        )}
      </fieldset>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-iris-600 px-4 py-2 font-medium text-white hover:bg-iris-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Save log"}
        </button>
      </div>
    </form>
  );
}

function StarOption({ checked, onChange, label, number }: { checked: boolean; onChange: () => void; label: string; number?: string }) {
  return (
    <label
      className={`flex cursor-pointer items-baseline gap-3 border-b border-plum-100 px-3 py-2 last:border-b-0 dark:border-plum-800 ${
        checked ? "bg-star-50 dark:bg-star-950/30" : "hover:bg-plum-50 dark:hover:bg-plum-800/50"
      }`}
    >
      <input type="radio" name="shooting-star" checked={checked} onChange={onChange} className="accent-star-500" />
      {number !== undefined && <span className="w-8 shrink-0 text-right text-plum-400 tabular-nums">{number}</span>}
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {checked && number !== undefined && <ShootingStarIcon />}
    </label>
  );
}
