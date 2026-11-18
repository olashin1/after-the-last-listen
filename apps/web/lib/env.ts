// Public Supabase settings. Safe for the browser; the service-role key must never be read here.
// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced literally.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy apps/web/.env.example to apps/web/.env.local and fill it from \`pnpm supabase status\`.`);
  }
  return value;
}

export const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabasePublishableKey = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
