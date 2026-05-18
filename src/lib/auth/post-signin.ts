/**
 * Helpers for restoring the user's prior location after a sign-in or
 * account-switch flow. The "Switch account" button in the navbar
 * switcher kicks off OAuth, which can either complete inside an
 * iframe (no reload) or via a top-level redirect through the
 * `/oauth/callback` page (full reload). Both paths read the same
 * sessionStorage keys so the user lands on the page they were
 * looking at, not at `/`.
 */

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
 * Rewrite a saved pre-signin path so any `/profile/<old-handle>`
 * segments point at the newly signed-in identity. The profile route
 * accepts a DID just as happily as a handle, so we substitute the
 * new identity's DID (no extra handle-resolution round-trip).
 *
 * Falls through unchanged for paths that don't reference the old
 * handle — feed pages, cert detail, /explore, etc. all stay put.
 */
export function rewritePathForNewIdentity(
  currentPath: string,
  prevHandle: string | null,
  newIdentifier: string | null,
): string {
  if (!prevHandle || !newIdentifier) return currentPath
  const enc = encodeURIComponent(prevHandle)
  if (!currentPath.includes(`/profile/${enc}`)) return currentPath
  return currentPath.split(`/profile/${enc}`).join(
    `/profile/${encodeURIComponent(newIdentifier)}`,
  )
}

/**
 * Convenience: combine the lookup + rewrite. Returns `/` when no
 * saved path is present — preserving the previous fallback.
 */
export function resolvePostSigninPath(newIdentifier: string | null): string {
  const { path, handle } = consumePreSigninLocation()
  if (!path) return "/"
  return rewritePathForNewIdentity(path, handle, newIdentifier)
}
