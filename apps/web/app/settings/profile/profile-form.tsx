"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, inputClass, SubmitButton, type FormState } from "@/components/form";
import { USERNAME_RULES } from "@/lib/messages";
import { updateProfile } from "./actions";

type Initial = { username: string; displayName: string; bio: string; visibility: "public" | "private" };

export function ProfileForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState(updateProfile, undefined as FormState);
  // After a submit, show what was saved (or what was submitted, on error).
  const v = { ...initial, ...state?.values };

  return (
    // key: re-mount after each submit so defaultValues reflect the latest saved values.
    <form key={JSON.stringify(v)} action={action} className="flex flex-col gap-4">
      <Field label="Username" hint={USERNAME_RULES}>
        <input
          name="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]+"
          defaultValue={v.username}
          className={inputClass}
        />
      </Field>
      <Field label="Display name" hint="Optional. Up to 50 characters.">
        <input name="displayName" maxLength={50} defaultValue={v.displayName} className={inputClass} />
      </Field>
      <Field label="Bio" hint="Optional. Up to 300 characters.">
        <textarea name="bio" maxLength={300} rows={4} defaultValue={v.bio} className={inputClass} />
      </Field>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">Visibility</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="visibility" value="public" defaultChecked={v.visibility === "public"} className="mt-1" />
          <span>
            Public <span className="text-plum-500">— anyone can see your albums, diary, ratings and reviews.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="visibility" value="private" defaultChecked={v.visibility === "private"} className="mt-1" />
          <span>
            Private <span className="text-plum-500">— only you can see them. Your name, username and bio stay visible.</span>
          </span>
        </label>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Save profile</SubmitButton>
      {state?.success && (
        <Link href={`/u/${v.username}`} className="text-sm underline">
          View your profile
        </Link>
      )}
    </form>
  );
}
