import type { Metadata } from "next";
import { AuthCard } from "@/components/form";
import { ForgotPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password">
      <p className="text-sm text-plum-500">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
