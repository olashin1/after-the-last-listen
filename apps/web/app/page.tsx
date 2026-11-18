import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

// Scaffold placeholder: confirms the server-side Supabase client can reach Auth.
async function SessionStatus() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return <p className="text-red-600">Supabase error: {error.message}</p>;
  }
  return <p>{data?.claims ? `Signed in as ${data.claims.sub}` : "Not signed in."}</p>;
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">After the Last Listen</h1>
      <Suspense fallback={<p>Checking session…</p>}>
        <SessionStatus />
      </Suspense>
    </main>
  );
}
