import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/auth";

// /albums is a shortcut to the signed-in user's own My Albums (/u/[username]/albums), for links that don't
// know the username (e.g. the Log dialog). Signed out, it asks to sign in first.
async function Redirect(): Promise<never> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in?next=/albums");
  redirect(`/u/${profile.username}/albums`);
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
