import Link from "next/link";
import { Suspense } from "react";
import { AlbumCover } from "@/components/album-cover";
import { AlbumTile } from "@/components/album-tile";
import { inputClass } from "@/components/form";
import { LogButton } from "@/components/log/log-dialog";
import { RatingStars, ShootingStarIcon } from "@/components/rating-stars";
import { getCurrentProfile } from "@/lib/auth";
import { getRecent } from "@/lib/collection";
import { getFeaturedAlbums } from "@/lib/featured";

// Landing page (docs/decisions.md, landing page). Signed out: a hero with the pitch and a wall of
// well-known covers, then "How it works". Signed in: a personal home (welcome, Log +, your 3 most
// recent albums, or a first-log prompt when there are none), without "How it works".

const primaryButton = "rounded-md bg-iris-600 px-5 py-2.5 font-medium text-white hover:bg-iris-700";
const secondaryButton =
  "rounded-md border border-plum-300 px-5 py-2.5 font-medium hover:bg-plum-100 dark:border-plum-700 dark:hover:bg-plum-800";

async function Top() {
  const profile = await getCurrentProfile();
  if (profile) return <Welcome username={profile.username} name={profile.display_name ?? profile.username} />;
  // "How it works" is for visitors; signed-in users already know (decided with the user).
  return (
    <>
      <Hero />
      <div className="mt-20">
        <HowItWorks />
      </div>
    </>
  );
}

function Hero() {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      <div className="flex flex-col gap-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Every album, remembered.</h1>
        <p className="text-lg text-plum-600 dark:text-plum-300">
          Log the albums you listen to, rate and review them, and pick a Shooting Star: your favorite track on each
          one. Your diary keeps every listen.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/sign-up" className={primaryButton}>Sign up</Link>
          <Link href="/search" className={secondaryButton}>Search albums</Link>
        </div>
        <p className="text-sm text-plum-500">
          Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>
        </p>
      </div>
      <Suspense fallback={<CoverWallSkeleton />}>
        <CoverWall />
      </Suspense>
    </div>
  );
}

async function CoverWall() {
  const albums = await getFeaturedAlbums();
  if (albums.length === 0) return <CoverWallSkeleton />;
  return (
    <ul aria-label="Albums to explore" className="grid grid-cols-4 gap-2 sm:gap-3">
      {albums.map((album, i) => (
        <li key={album.id} className={i % 2 === 1 ? "translate-y-3" : ""}>
          <Link
            href={`/album/${album.id}`}
            title={`${album.title} · ${album.artist_credit}`}
            className="block overflow-hidden rounded-md shadow-md shadow-plum-900/20 transition-transform hover:-translate-y-1 [&>*]:!h-full [&>*]:!w-full"
          >
            <AlbumCover mbid={album.mbid} title={album.title} size={160} source={250} priority={i < 8} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CoverWallSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-4 gap-2 sm:gap-3">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className={`aspect-square rounded-md bg-plum-200 dark:bg-plum-800 ${i % 2 === 1 ? "translate-y-3" : ""}`} />
      ))}
    </div>
  );
}

async function Welcome({ username, name }: { username: string; name: string }) {
  const { recent } = await getRecent(username);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back, {name}</h1>
          <p className="text-plum-500">
            <Link href={`/u/${username}/albums`} className="hover:underline">My Albums</Link>
            {" · "}
            <Link href={`/u/${username}/diary`} className="hover:underline">Diary</Link>
          </p>
        </div>
        {/* With no logs, the first-log prompt below has the Log button. */}
        {recent.length > 0 && <LogButton className={primaryButton}>Log +</LogButton>}
      </div>

      {recent.length > 0 ? (
        <section aria-labelledby="home-recent-heading" className="flex flex-col gap-4">
          <h2 id="home-recent-heading" className="text-sm font-semibold tracking-wide text-plum-600 uppercase dark:text-plum-300">
            Recently listened
          </h2>
          <ul className="grid grid-cols-3 gap-4 sm:gap-6">
            {recent.map((item) => (
              <li key={item.user_album_id}>
                <AlbumTile item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <FirstLogPrompt />
      )}
    </div>
  );
}

/** PRD §2: a new user with no logs gets a search box and a nudge instead of an empty page. */
function FirstLogPrompt() {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-dashed border-plum-300 p-6 dark:border-plum-700">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Log your first album</h2>
        <p className="text-plum-500">Search for something you listened to recently, or open the Log dialog.</p>
      </div>
      <form action="/search" role="search" className="flex flex-wrap gap-2">
        <input name="q" type="search" placeholder="Search albums or artists" aria-label="Search albums" className={`${inputClass} min-w-0 flex-1`} />
        <button type="submit" className={secondaryButton}>Search</button>
        <LogButton className={primaryButton}>Log +</LogButton>
      </form>
    </section>
  );
}

const STEPS = [
  {
    title: "Log a listen",
    body: "Search any album and log it with the day you listened. Listen again? Log it again.",
    icon: <DiscIcon />,
  },
  {
    title: "Rate and review",
    body: "Half-star ratings and an optional review. Change them whenever your opinion does.",
    icon: <RatingStars rating={3.5} size={18} />,
  },
  {
    title: "Pick a Shooting Star",
    body: "Your favorite track on the album, shown in gold wherever the album appears.",
    icon: <ShootingStarIcon className="text-2xl" />,
  },
  {
    title: "Keep a diary",
    body: "Every listen, newest first, with your ratings and reviews alongside.",
    icon: <DiaryIcon />,
  },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="flex flex-col gap-6">
      <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">How it works</h2>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col gap-3 rounded-xl bg-plum-100 p-5 dark:bg-plum-900">
            <div className="flex h-8 items-center justify-between">
              <span className="flex items-center text-iris-600 dark:text-iris-400">{step.icon}</span>
              <span className="text-sm font-medium text-plum-400 tabular-nums">{i + 1}</span>
            </div>
            <h3 className="font-semibold">{step.title}</h3>
            <p className="text-sm text-plum-600 dark:text-plum-300">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DiscIcon() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5" strokeLinecap="round" />
    </svg>
  );
}

function DiaryIcon() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-14 pb-20 sm:pt-20">
      <Suspense fallback={<div className="min-h-80" />}>
        <Top />
      </Suspense>
    </main>
  );
}
