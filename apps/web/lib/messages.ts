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
  invalid_avatar: "That upload didn't go through. Try choosing the image again.",
  // Logging (log_album, update_user_album).
  album_not_found: "We couldn't find that album.",
  album_merged: "This album was merged into another one. Open it again to log the current version.",
  invalid_date: "Choose a valid date.",
  future_date: "The listen date can't be in the future.",
  invalid_rating: "Ratings go from half a star to five stars.",
  review_too_long: "Reviews can be at most 5,000 characters.",
  invalid_shooting_star: "Pick your Shooting Star from this album's tracklist.",
  not_in_collection: "This album isn't in your albums.",
};

export const AVATAR_RULES = "JPEG, PNG or WebP. We crop it to a square.";

// Storage API error codes (StorageApiError.code) for avatar uploads.
// See https://supabase.com/docs/guides/storage/debugging/error-codes
const STORAGE_ERRORS: Record<string, string> = {
  EntityTooLarge: "That image is too large. The limit is 2 MB.",
  InvalidMimeType: "That file type isn't supported. Use JPEG, PNG or WebP.",
  AccessDenied: "Your session has expired. Sign in again.",
  InvalidJWT: "Your session has expired. Sign in again.",
};

export function storageErrorMessage(error: { code?: string }): string {
  return (error.code && STORAGE_ERRORS[error.code]) ?? GENERIC;
}

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
