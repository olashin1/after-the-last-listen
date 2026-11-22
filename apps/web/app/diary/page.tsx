import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/auth";

// /diary is a shortcut to the signed-in user's own Diary (/u/[username]/diary), for links that don't
// know the username (e.g. the Log dialog). Signed out, it asks to sign in first.
async function Redirect(): Promise<never> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in?next=/diary");
  redirect(`/u/${profile.username}/diary`);
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
