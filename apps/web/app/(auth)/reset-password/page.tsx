import type { Metadata } from "next";
import { AuthCard } from "@/components/form";
import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Choose a new password" };

// Reached from the reset email via /auth/confirm, which signs the user in. proxy.ts requires a session.
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm />
    </AuthCard>
  );
}
