"use client";

import { Star } from "@/components/rating-stars";
import { ratingFromStar, ratingLabel, starFill, stepRating } from "@/lib/rating";

const SIZE = 48;

/**
 * Half-star rating input. One slider (arrow keys move half a star, Home/End jump, Delete clears);
 * clicking the left half of a star gives the half step. Unrated is null.
 */
export function RatingInput({ value, onChange }: { value: number | null; onChange: (rating: number | null) => void }) {
  function onKeyDown(e: React.KeyboardEvent) {
    const keys: Record<string, () => number | null> = {
      ArrowRight: () => stepRating(value, 1),
      ArrowUp: () => stepRating(value, 1),
      ArrowLeft: () => stepRating(value, -1),
      ArrowDown: () => stepRating(value, -1),
      Home: () => 0.5,
      End: () => 5,
      Delete: () => null,
      Backspace: () => null,
    };
    const next = keys[e.key];
    if (!next) return;
    e.preventDefault();
    onChange(next());
  }

  function onStarClick(star: number, e: React.MouseEvent<HTMLSpanElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    onChange(ratingFromStar(star, e.clientX - box.left < box.width / 2));
  }

  return (
    <div className="flex items-center gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Rating"
        aria-valuemin={0.5}
        aria-valuemax={5}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? "Unrated" : ratingLabel(value)}
        onKeyDown={onKeyDown}
        className="flex cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-iris-500"
      >
        {[1, 2, 3, 4, 5].map((s) => (
          <span key={s} onClick={(e) => onStarClick(s, e)} className="px-0.5">
            <Star fill={starFill(value, s)} size={SIZE} />
          </span>
        ))}
      </div>
      <span className="w-16 text-sm text-plum-500 tabular-nums">{value === null ? "Unrated" : value}</span>
      {value !== null && (
        <button type="button" onClick={() => onChange(null)} className="text-sm text-plum-500 underline">
          Clear
        </button>
      )}
    </div>
  );
}
