// User-facing text for the error names raised by Postgres functions (see the profiles migration).
// Validation itself lives in the database; this only translates its answers.

export const USERNAME_RULES = "3–20 characters: lowercase letters, numbers and underscores.";

const DB_ERRORS: Record<string, string> = {
  username_taken: "That username is taken.",
  invalid_username: `Usernames are ${USERNAME_RULES}`,
  display_name_too_long: "Display name can be at most 50 characters.",
  bio_too_long: "Bio can be at most 300 characters.",
  invalid_visibility: "Choose public or private.",
  not_authenticated: "Your session has expired. Sign in again.",
  profile_not_found: "We couldn't find your profile.",
};

const GENERIC = "Something went wrong. Please try again.";

export function dbErrorMessage(message: string | undefined): string {
  return (message && DB_ERRORS[message]) ?? GENERIC;
}

// Supabase Auth error codes (AuthError.code).
const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "Wrong email or password.",
  email_not_confirmed: "Confirm your email first. Check your inbox for the link.",
  weak_password: "That password is too weak. Use at least 8 characters.",
  same_password: "Choose a password different from your current one.",
  email_address_invalid: "Enter a valid email address.",
  user_already_exists: "An account with that email already exists.",
  over_email_send_rate_limit: "Too many emails sent. Wait a minute and try again.",
  over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
};

/**
 * Message for an AuthError. Note: when a database trigger rejects a sign-up, supabase-js only
 * sees a 500 "Database error saving new user" with no code, so callers must find the cause
 * themselves (see signUp).
 */
export function authErrorMessage(error: { code?: string }): string {
  return (error.code && AUTH_ERRORS[error.code]) ?? GENERIC;
}
