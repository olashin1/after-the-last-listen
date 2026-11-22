// One five-point star with rounded points (docs/decisions.md, design). The polygon is stroked in its
// own fill colour with round joins, which softens each point. Colour comes from `currentColor`, so
// callers set it with a text-* class.

const POINTS = "12,2.6 14.85,8.55 21.4,9.35 16.6,13.85 17.85,20.35 12,17.15 6.15,20.35 7.4,13.85 2.6,9.35 9.15,8.55";

export function StarIcon({ size, className = "" }: { size: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <polygon points={POINTS} fill="currentColor" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" />
    </svg>
  );
}
