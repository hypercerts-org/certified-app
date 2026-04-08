const DEV_FALLBACK = "http://localhost:3000"

/**
 * The application's public URL. Always defined — falls back to localhost in development.
 * Used by CSRF protection and anywhere a guaranteed URL is needed.
 */
export const PUBLIC_URL: string =
  process.env.PUBLIC_URL || DEV_FALLBACK

/**
 * The application's public URL, or undefined in production when PUBLIC_URL env var is missing.
 * Used by OAuth client which requires explicit configuration in production.
 */
export const PUBLIC_URL_STRICT: string | undefined =
  process.env.PUBLIC_URL ||
  (process.env.NODE_ENV === "production" ? undefined : DEV_FALLBACK)
