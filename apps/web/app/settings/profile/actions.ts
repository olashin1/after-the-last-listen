"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/form";
import { AVATAR_BUCKET } from "@/lib/avatar";
import { dbErrorMessage } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    visibility: formData.get("visibility") === "private" ? "private" : "public",
  } as const;

  // All validation and normalization happens in update_profile().
  const supabase = await createClient();
  // update_profile returns one row (not a set), so `data` is the saved profile.
  const { data, error } = await supabase.rpc("update_profile", {
    p_username: values.username,
    p_display_name: values.displayName,
    p_bio: values.bio,
    p_visibility: values.visibility,
  });

  if (error) return { error: dbErrorMessage(error.message), values };

  refresh(); // Header shows the username, which may have changed.
  return {
    success: "Profile saved.",
    values: {
      username: data.username,
      displayName: data.display_name ?? "",
      bio: data.bio ?? "",
      visibility: data.visibility,
    },
  };
}

export type AvatarResult = { error?: string };

/**
 * Delete a replaced avatar file. Direct deletes from storage.objects are blocked, so this goes
 * through the Storage API with the user's session (the bucket policy limits it to their folder).
 * A failure only leaves an orphaned file, so it doesn't fail the request.
 */
async function deleteOldAvatar(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null) {
  if (!path) return;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) console.error("Could not delete old avatar", path, error.message);
}

/** Point the profile at a file the browser just uploaded to the user's avatars folder. */
export async function setAvatar(path: string): Promise<AvatarResult> {
  const supabase = await createClient();
  // set_avatar checks the file exists and belongs to the caller; it returns the previous path.
  const { data: previous, error } = await supabase.rpc("set_avatar", { p_path: String(path) });
  if (error) return { error: dbErrorMessage(error.message) };

  await deleteOldAvatar(supabase, previous);
  refresh(); // Header and profile page show the avatar.
  return {};
}

export async function removeAvatar(): Promise<AvatarResult> {
  const supabase = await createClient();
  const { data: previous, error } = await supabase.rpc("remove_avatar");
  if (error) return { error: dbErrorMessage(error.message) };

  await deleteOldAvatar(supabase, previous);
  refresh();
  return {};
}
