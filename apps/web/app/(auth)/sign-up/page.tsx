import type { Metadata } from "next";
import { AuthCard } from "@/components/form";
import { SignUpForm } from "../forms";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <AuthCard title="Create your account">
      <SignUpForm />
    </AuthCard>
  );
}
