"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, inputClass, SubmitButton, type FormState } from "@/components/form";
import { USERNAME_RULES } from "@/lib/messages";
import { requestPasswordReset, signIn, signUp, updatePassword } from "./actions";

const PASSWORD_HINT = "At least 8 characters.";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, undefined as FormState);

  if (state?.success) return <FormMessage state={state} />;

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email">
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} className={inputClass} />
      </Field>
      <Field label="Username" hint={`${USERNAME_RULES} You can change it later.`}>
        <input
          name="username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]+"
          defaultValue={state?.values?.username}
          className={inputClass}
        />
      </Field>
      <Field label="Password" hint={PASSWORD_HINT}>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Create account</SubmitButton>
      <p className="text-sm text-plum-500">
        Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>
      </p>
    </form>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined as FormState);

  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email">
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} className={inputClass} />
      </Field>
      <Field label="Password">
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
      <p className="flex justify-between text-sm text-plum-500">
        <Link href="/forgot-password" className="underline">Forgot password?</Link>
        <Link href="/sign-up" className="underline">Create an account</Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined as FormState);

  if (state?.success) return <FormMessage state={state} />;

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email">
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined as FormState);

  if (state?.success) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <Link href="/settings/profile" className="underline">Go to your profile settings</Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="New password" hint={PASSWORD_HINT}>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Update password</SubmitButton>
    </form>
  );
}
