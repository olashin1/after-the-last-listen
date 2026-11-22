import { ratingLabel, starFill } from "@/lib/rating";

/** One star, filled 0, half or full. The empty star sits underneath; the fill is clipped over it. */
export function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: number }) {
  return (
    <span aria-hidden className="relative inline-block leading-none" style={{ width: size, height: size, fontSize: size }}>
      <span className="absolute inset-0 text-zinc-300 dark:text-zinc-700">★</span>
      <span className="absolute inset-0 overflow-hidden text-violet-600 dark:text-violet-400" style={{ width: `${fill * 100}%` }}>
        ★
      </span>
    </span>
  );
}

/** Read-only rating as five stars. Renders nothing for unrated. */
export function RatingStars({ rating, size = 16 }: { rating: number | null; size?: number }) {
  if (rating === null) return null;
  return (
    <span role="img" aria-label={ratingLabel(rating)} className="inline-flex shrink-0">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} fill={starFill(rating, s)} size={size} />
      ))}
    </span>
  );
}

/** The Shooting Star marker and track title (PRD §4 display). */
export function ShootingStarLabel({ title, className = "" }: { title: string; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-baseline gap-1 text-amber-600 dark:text-amber-400 ${className}`}>
      <span aria-hidden>★</span>
      <span className="sr-only">Shooting Star:</span>
      <span className="truncate">{title}</span>
    </span>
  );
}
