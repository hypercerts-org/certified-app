"use client"

type AuthFetchListener = () => void
let onUnauthorized: AuthFetchListener | null = null

export function setOnUnauthorized(listener: AuthFetchListener | null) {
  onUnauthorized = listener
}

/**
 * Routes whose 401 actually means "the user's atproto session is gone".
 *
 *   - `/api/xrpc/*` — proxied through the user's PDS using the OAuth
 *     session. 401 here implies the OAuth tokens are no longer valid.
 *   - `/api/auth/*` — our own session cookie endpoints.
 *
 * NOT included: `/api/groups/*`, `/api/indexer`, etc.
 * Those use service-auth JWTs or server-to-server fetches; a 401 from
 * those is an upstream-service failure, not a user-session failure, and
 * must not log the user out.
 */
const SESSION_BEARING_PREFIXES = ["/api/xrpc/", "/api/auth/"]

function indicatesSessionExpiry(input: RequestInfo | URL): boolean {
  let urlString: string
  if (typeof input === "string") urlString = input
  else if (input instanceof URL) urlString = input.toString()
  else if (typeof Request !== "undefined" && input instanceof Request) urlString = input.url
  else return false

  try {
    const base = typeof location !== "undefined" ? location.origin : "http://localhost"
    const path = new URL(urlString, base).pathname
    return SESSION_BEARING_PREFIXES.some((p) => path.startsWith(p))
  } catch {
    return false
  }
}

export interface AuthFetchOptions {
  /**
   * When true, a 401 response will NOT trigger `onUnauthorized` even
   * if the URL is session-bearing. Use for fire-and-forget background
   * work (e.g. best-effort cleanup deletes) where a transient 401
   * shouldn't log the user out as a side-effect of unrelated work.
   * The caller is responsible for handling the 401 themselves.
   */
  suppressUnauthorizedHandler?: boolean
}

/**
 * Wrapper around fetch that detects session-expiry 401s and triggers
 * re-authentication. Scope is intentionally narrow — see
 * `SESSION_BEARING_PREFIXES`. An upstream-service 401 (e.g. CGS rejecting
 * a service-auth JWT) is reported back to the caller as a normal failed
 * response without disturbing the auth state.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: AuthFetchOptions,
): Promise<Response> {
  const res = await fetch(input, init)
  if (
    res.status === 401 &&
    onUnauthorized &&
    indicatesSessionExpiry(input) &&
    !opts?.suppressUnauthorizedHandler
  ) {
    onUnauthorized()
  }
  return res
}
