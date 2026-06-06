/**
 * Helpers for restoring the user's prior location after a sign-in or
 * account-switch flow. The "Switch account" button in the navbar
 * switcher kicks off OAuth, which can either complete inside an
 * iframe (no reload) or via a top-level redirect through the
 * `/oauth/callback` page (full reload). Both paths read the same
 * sessionStorage keys so the user lands on the page they were
 * looking at, not at `/`.
 */

import { profileUrl } from "@/lib/urls"

const PATH_KEY = "post-signin-path"
const HANDLE_KEY = "pre-signin-handle"

/**
 * Stash the current pathname + query and the active handle before
 * opening the sign-in modal. Called from `openSignIn` in the auth
 * context. Safe to call from any client component.
 */
export function recordPreSigninLocation(currentHandle: string | null): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(
      PATH_KEY,
      window.location.pathname + window.location.search,
    )
    if (currentHandle) {
      sessionStorage.setItem(HANDLE_KEY, currentHandle)
    } else {
      sessionStorage.removeItem(HANDLE_KEY)
    }
  } catch {
    // sessionStorage can throw in private-mode / quota-exceeded
    // scenarios. Swallow — losing the saved path just means we fall
    // back to "/" after sign-in, which is the original behaviour.
  }
}

/**
 * Read + clear the saved pathname and pre-signin handle. Returns
 * `{ path: null, handle: null }` when nothing was stashed.
 */
export function consumePreSigninLocation(): {
  path: string | null
  handle: string | null
} {
  if (typeof window === "undefined") return { path: null, handle: null }
  try {
    const path = sessionStorage.getItem(PATH_KEY)
    const handle = sessionStorage.getItem(HANDLE_KEY)
    sessionStorage.removeItem(PATH_KEY)
    sessionStorage.removeItem(HANDLE_KEY)
    return { path, handle }
  } catch {
    return { path: null, handle: null }
  }
}

/**
 * Rewrite a saved pre-signin path so a leading `/<old-handle>` profile
 * segment points at the newly signed-in identity. Under the handle-forward
 * scheme the profile (and the user's own record pages) live at the root —
 * `/<handle>`, `/<handle>/activity/<rkey>` — so we swap the first path
 * segment when it matches the old handle. The route accepts a DID just as
 * happily as a handle, so we substitute the new identity's DID (no extra
 * handle-resolution round-trip; it canonicalizes to the handle on load).
 *
 * Falls through unchanged for paths that don't start with the old handle —
 * feed pages, record detail for other users, /explore, etc. stay put.
 */
export function rewritePathForNewIdentity(
  currentPath: string,
  prevHandle: string | null,
  newIdentifier: string | null,
): string {
  if (!prevHandle || !newIdentifier) return currentPath
  const queryIndex = currentPath.indexOf("?")
  const pathname =
    queryIndex === -1 ? currentPath : currentPath.slice(0, queryIndex)
  const query = queryIndex === -1 ? "" : currentPath.slice(queryIndex)
  const segments = pathname.split("/")
  // segments[0] is "" (leading slash); segments[1] is the first segment.
  let first = segments[1] ?? ""
  try {
    first = decodeURIComponent(first)
  } catch {
    // keep raw on malformed escape
  }
  if (first !== prevHandle) return currentPath
  segments[1] = newIdentifier
  return segments.join("/") + query
}

/**
 * Marketing / legal pages. A user who signs in from one of these
 * is treated as a new entry into the app, not as someone reading X
 * who happened to sign in mid-flow — so the saved-path restore is
 * bypassed and they land on their own profile instead.
 */
const MARKETING_ROUTES = [
  "/welcome",
  "/about",
  "/terms",
  "/privacy",
  "/imprint",
] as const

function isMarketingPath(path: string): boolean {
  const pathname = path.split("?")[0]
  return MARKETING_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  )
}

/**
 * Convenience: combine the lookup + rewrite. Returns `/` when no
 * saved path is present — preserving the previous fallback.
 *
 * Sign-ins originating from a {@link MARKETING_ROUTES} page route
 * the user to their own profile. Sign-ins from any other page
 * preserve the user's prior location.
 */
export function resolvePostSigninPath(newIdentifier: string | null): string {
  const { path, handle } = consumePreSigninLocation()
  if (!path) return "/"
  if (newIdentifier && isMarketingPath(path)) {
    return profileUrl(newIdentifier)
  }
  return rewritePathForNewIdentity(path, handle, newIdentifier)
}
