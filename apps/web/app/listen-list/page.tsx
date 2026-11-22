import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/auth";

// /listen-list is a shortcut to the signed-in user's own Listen List (/u/[username]/listen-list), for links that don't
// know the username (e.g. the Log dialog). Signed out, it asks to sign in first.
async function Redirect(): Promise<never> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in?next=/listen-list");
  redirect(`/u/${profile.username}/listen-list`);
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
