import Link from "next/link";
import { AlbumCover } from "@/components/album-cover";
import { RatingStars, ShootingStarLabel } from "@/components/rating-stars";
import type { CollectionItem } from "@/lib/collection";

/** One album in a grid (My Albums, the profile's "Recently listened"): cover, title, artist, rating, Shooting Star. */
export function AlbumTile({ item }: { item: CollectionItem }) {
  const rating = item.rating === null ? null : Number(item.rating);
  return (
    <Link href={`/album/${item.album_id}`} className="group flex flex-col gap-1.5">
      <span className="block aspect-square w-full overflow-hidden rounded [&>*]:!h-full [&>*]:!w-full">
        <AlbumCover mbid={item.mbid} title={item.title} size={200} />
      </span>
      <span className="text-sm font-medium leading-snug break-words group-hover:underline">{item.title}</span>
      <span className="-mt-1 text-xs text-plum-500 break-words">{item.artist_credit || "Unknown artist"}</span>
      <RatingStars rating={rating} size={21} />
      {item.shooting_star_title && <ShootingStarLabel title={item.shooting_star_title} className="text-xs" />}
    </Link>
  );
}
