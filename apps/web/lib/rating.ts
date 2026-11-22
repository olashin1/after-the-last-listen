// Ratings are 0.5–5 in half steps, or unrated (NULL) (PRD §5). The database enforces this in
// log_album() / update_user_album(); these helpers only drive the inputs and the display.

/** Every valid rating, lowest first: 0.5, 1, 1.5 … 5. */
export const RATINGS: readonly number[] = Array.from({ length: 10 }, (_, i) => (i + 1) / 2);

export function isValidRating(value: number): boolean {
  return RATINGS.includes(value);
}

/** "3.5 stars", "1 star". */
export function ratingLabel(rating: number): string {
  return `${rating} star${rating === 1 ? "" : "s"}`;
}

/** How full star number `star` (1–5) is for a rating: 0, 0.5 or 1. */
export function starFill(rating: number | null, star: number): 0 | 0.5 | 1 {
  if (rating === null) return 0;
  if (rating >= star) return 1;
  if (rating >= star - 0.5) return 0.5;
  return 0;
}

/** The rating a click on star `star` gives: its left half is the half step, the right half the whole. */
export function ratingFromStar(star: number, leftHalf: boolean): number {
  return leftHalf ? star - 0.5 : star;
}

/** Arrow-key step: one half star, kept within 0.5–5. Unrated starts at 0.5 going up. */
export function stepRating(rating: number | null, direction: 1 | -1): number {
  const next = (rating ?? 0) + direction * 0.5;
  return Math.min(5, Math.max(0.5, next));
}

/** Parse a rating from form input or an action argument; anything invalid is unrated. */
export function parseRating(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : NaN;
  return isValidRating(n) ? n : null;
}
