import { avatarUrl } from "@/lib/avatar";

/**
 * Round avatar, or the first letter of the name when there's no image.
 * Plain <img>: Next 16's optimizer refuses local IPs (the local Supabase is 127.0.0.1) and files
 * are already 512px. Revisit next/image with remotePatterns for the hosted project.
 */
export function Avatar({ path, name, size }: { path: string | null | undefined; name: string; size: number }) {
  const src = avatarUrl(path);
  const style = { width: size, height: size };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- see comment above
      <img src={src} alt="" width={size} height={size} style={style} className="shrink-0 rounded-full object-cover" />
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      className="flex shrink-0 select-none items-center justify-center rounded-full bg-plum-200 font-medium uppercase text-plum-600 dark:bg-plum-800 dark:text-plum-300"
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}
