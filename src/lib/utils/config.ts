const DEV_FALLBACK = "http://localhost:3000"

export const DEFAULT_PDS_URL = process.env.NEXT_PUBLIC_PDS_URL || "https://certified.one"

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

/**
 * Feature flag: aggregate notifications across the viewer's managed
 * identities (the groups they own/admin) rather than only their personal
 * account. Default OFF.
 *
 * This gate exists because notifications are the one aggregation surface
 * that needs an external magic-indexer change first: the notifications op
 * is scoped by the service-auth JWT `iss`, so reading a group's
 * notifications requires the indexer to accept a `recipients` argument and
 * authorize it against its own role index. See
 * docs/org-identity/indexer-notifications-aggregation.md for the contract.
 *
 * Until that ships, the client must NOT send `recipients` — the current
 * indexer would reject the variant query. The flag is read BOTH server-side
 * (the /api/notifications route, to choose the query variant) and
 * client-side (the hooks + the notifications UI), so it's a NEXT_PUBLIC_
 * var. Flip it on a preview env once the indexer supports it.
 */
export const NOTIFICATIONS_AGGREGATION_ENABLED =
  process.env.NEXT_PUBLIC_NOTIFICATIONS_AGGREGATION === "true"
