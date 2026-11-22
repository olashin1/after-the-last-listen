import { StarIcon } from "@/components/star-icon";
import { ratingLabel, starFill } from "@/lib/rating";

/** One rating star, filled 0, half or full. The empty star sits underneath; the fill is clipped over it. */
export function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: number }) {
  return (
    <span aria-hidden className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <StarIcon size={size} className="absolute inset-0 text-plum-300 dark:text-plum-700" />
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
        <StarIcon size={size} className="text-iris-500 dark:text-iris-400" />
      </span>
    </span>
  );
}

/** Read-only rating as five stars. Renders nothing for unrated. */
export function RatingStars({ rating, size = 24 }: { rating: number | null; size?: number }) {
  if (rating === null) return null;
  return (
    <span role="img" aria-label={ratingLabel(rating)} className="inline-flex shrink-0 gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} fill={starFill(rating, s)} size={size} />
      ))}
    </span>
  );
}

/** The gold Shooting Star marker, sized to the surrounding text (about 1.5× the old glyph). */
export function ShootingStarIcon({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 self-center text-star-600 dark:text-star-400 ${className}`}>
      <StarIcon size={18} className="h-[1.5em] w-[1.5em]" />
    </span>
  );
}

/** The Shooting Star marker and track title (PRD §4 display). */
export function ShootingStarLabel({ title, className = "" }: { title: string; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-star-600 dark:text-star-400 ${className}`}>
      <ShootingStarIcon />
      <span className="sr-only">Shooting Star:</span>
      <span className="truncate">{title}</span>
    </span>
  );
}
