"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/form";
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
