import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/auth";
import { AvatarForm } from "./avatar-form";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Edit profile" };

async function EditProfile() {
  const profile = await getCurrentProfile();
  // proxy.ts already requires a session; this covers a session without a profile row.
  if (!profile) redirect("/sign-in?next=/settings/profile");

  return (
    <>
      <AvatarForm userId={profile.user_id} path={profile.avatar_url} name={profile.display_name ?? profile.username} />
      <ProfileForm
        initial={{
          username: profile.username,
          displayName: profile.display_name ?? "",
          bio: profile.bio ?? "",
          visibility: profile.visibility,
        }}
      />
    </>
  );
}

export default function EditProfilePage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Edit profile</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <EditProfile />
      </Suspense>
    </main>
  );
}
