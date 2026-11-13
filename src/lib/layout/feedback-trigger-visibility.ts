import { isFormRoute } from "./bottom-nav-visibility"

/** Record types with a page at `/{actor}/{type}/{rkey}`. */
const RECORD_TYPES: ReadonlySet<string> = new Set(["activity", "project"])

/**
 * True on a record page or anything under it: `/{actor}/activity/{rkey}`,
 * `/{actor}/project/{rkey}`, and their edit and update pages.
 */
export function isRecordPath(pathname: string | null): boolean {
  if (!pathname) return false
  const segments = pathname.split("/").filter(Boolean)
  return segments.length >= 3 && RECORD_TYPES.has(segments[1])
}

/**
 * Whether the floating Feedback button (desktop, `<FeedbackTrigger>`) is
 * shown on `pathname`. It floats bottom-right, where these pages keep
 * controls of their own, so it stays off them (Feedback is still in the
 * account menu, the site footer and Help):
 *  - `/welcome` (its own contact CTA) and `/embed` (a bare board in a
 *    third-party iframe);
 *  - Records: it covered the rows' edit and "more" buttons and the
 *    selection bar's Clear;
 *  - record pages (an activity, a project) and everything under them;
 *  - create and edit forms, whose action bar is pinned to the bottom
 *    (`isFormRoute`; layout.css also hides it under any `.form-action-bar`).
 */
export function isFeedbackTriggerVisible(pathname: string | null): boolean {
  if (!pathname) return true
  if (pathname === "/welcome" || pathname.startsWith("/embed")) return false
  if (pathname === "/records" || pathname.startsWith("/records/")) return false
  if (isRecordPath(pathname)) return false
  if (isFormRoute(pathname)) return false
  return true
}
