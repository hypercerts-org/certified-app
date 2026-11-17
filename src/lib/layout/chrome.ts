/**
 * Which chrome a route gets: the one place that decides it, so the
 * desktop sidebar, the content strip, the phone top bar, the phone pill
 * and the app shell agree.
 *
 *  - "app": the app chrome (sidebar and strip on desktop; top bar and pill
 *    on phones).
 *  - "editorial": the legal pages. On desktop they render their own
 *    landing top bar and full-width content; on phones they keep the app's
 *    top bar and pill.
 *  - "landing": /welcome, with its own minimal chrome at every width.
 *  - "embed": /embed/*, rendered bare inside a third-party iframe (and
 *    /dev/preview/shell, the dev preview that mounts its own chrome).
 */
export type RouteChrome = "app" | "editorial" | "landing" | "embed"

const EDITORIAL_PATHS: ReadonlySet<string> = new Set(["/terms", "/privacy", "/imprint", "/dsa"])

export function routeChrome(pathname: string | null): RouteChrome {
  if (!pathname) return "app"
  // The dev preview of the chrome mounts its own (signed in, mocked).
  if (pathname.startsWith("/embed") || pathname.startsWith("/dev/preview/shell")) return "embed"
  if (pathname === "/welcome") return "landing"
  if (EDITORIAL_PATHS.has(pathname)) return "editorial"
  return "app"
}

/** The desktop sidebar and content strip: app routes only. */
export function hasDesktopChrome(pathname: string | null): boolean {
  return routeChrome(pathname) === "app"
}

/** The phone top bar and pill: app routes and the legal pages. */
export function hasPhoneChrome(pathname: string | null): boolean {
  const chrome = routeChrome(pathname)
  return chrome === "app" || chrome === "editorial"
}
