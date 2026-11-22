import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/form";

export const metadata: Metadata = { title: "Link not valid" };

export default function AuthErrorPage() {
  return (
    <AuthCard title="That link didn't work">
      <p className="text-sm text-plum-500">
        The link may have expired or already been used. Email links work once and expire after an hour.
      </p>
      <p className="flex gap-4 text-sm">
        <Link href="/sign-in" className="underline">Sign in</Link>
        <Link href="/forgot-password" className="underline">Send a new reset link</Link>
      </p>
    </AuthCard>
  );
}
