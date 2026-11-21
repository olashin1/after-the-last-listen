"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { safeNextPath } from "@/lib/auth";
import { authErrorMessage, dbErrorMessage } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").trim();
  const password = text(formData, "password");
  const username = text(formData, "username");
  const values = { email, username };

  const supabase = await createClient();

  // Pre-check so we can say exactly what's wrong. The sign-up trigger is still the final guard.
  const { data: status, error: checkError } = await supabase.rpc("check_username", { p_username: username });
  if (checkError) return { error: dbErrorMessage(undefined), values };
  if (status === "taken") return { error: dbErrorMessage("username_taken"), values };
  if (status === "invalid") return { error: dbErrorMessage("invalid_username"), values };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) {
    // A trigger rejection reaches us as a codeless 500. The likely cause is that someone took
    // the username after the pre-check, so check again before falling back to a generic error.
    if (!error.code) {
      const { data: recheck } = await supabase.rpc("check_username", { p_username: username });
      if (recheck === "taken") return { error: dbErrorMessage("username_taken"), values };
    }
    return { error: authErrorMessage(error), values };
  }

  // With email confirmation off there is a session already; otherwise the user must confirm first.
  if (data.session) redirect("/settings/profile");
  return { success: `Check ${email} for a link to confirm your account.` };
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").trim();
  const password = text(formData, "password");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error), values: { email } };

  redirect(safeNextPath(text(formData, "next")));
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").trim();

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  // Auth doesn't reveal whether the account exists; only surface errors like rate limits.
  if (error && error.code?.startsWith("over_")) return { error: authErrorMessage(error), values: { email } };

  return { success: `If an account exists for ${email}, we've sent a link to reset its password.` };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = text(formData, "password");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authErrorMessage(error) };

  return { success: "Your password has been updated." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
