// Small shared form pieces so every auth/profile form looks and behaves the same.

export type FormState = {
  error?: string;
  success?: string;
  /** Submitted non-secret values, so the form keeps them after an error. */
  values?: Record<string, string>;
} | undefined;

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-plum-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "rounded-md border border-plum-300 bg-transparent px-3 py-2 text-base outline-none focus:border-plum-900 focus:ring-2 focus:ring-plum-900/10 dark:border-plum-700 dark:focus:border-plum-100";

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-plum-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-plum-100 dark:text-plum-900"
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state?.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {state.error}
      </p>
    );
  }
  if (state?.success) {
    return (
      <p role="status" className="text-sm text-green-700 dark:text-green-500">
        {state.success}
      </p>
    );
  }
  return null;
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}
