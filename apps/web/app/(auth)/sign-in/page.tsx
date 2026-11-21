import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/form";
import { safeNextPath } from "@/lib/auth";
import { SignInForm } from "../forms";

export const metadata: Metadata = { title: "Sign in" };

async function SignInWithNext({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next, "");
  return <SignInForm next={nextPath || undefined} />;
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <AuthCard title="Sign in">
      <Suspense fallback={<SignInForm />}>
        <SignInWithNext searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}
