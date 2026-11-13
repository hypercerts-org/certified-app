/**
 * Single source of truth for whether the phone bottom tab bar
 * (<BottomNav>) is on screen.
 *
 * The bar shows in every phone browser, installed app or not, and never
 * hides a tab per account. It is hidden only when ONE of these holds:
 *  - desktop (≥800px): the desktop top bar carries the destinations, and
 *    the bar's links would compete for tab order, so it unmounts.
 *  - an /embed route: embeds render bare (board-only) inside a
 *    third-party iframe.
 *  - /welcome: the landing page has its own minimal chrome (wordmark +
 *    sign-in) at every width.
 *  - a create or edit form (`isFormRoute`): the form's own action bar is
 *    pinned to the bottom, and the tab bar under it would leave the fields
 *    a sliver of the screen. Cancel or the back link is the way out.
 *
 * When the bar is absent `--bottom-nav-height` resolves to 0 (tokens.css),
 * so bottom-pinned UI (the form action bar, toasts) sits at the edge.
 */
export function isBottomNavVisible(params: {
  pathname: string;
  isDesktop: boolean;
}): boolean {
  const { pathname, isDesktop } = params;
  return (
    !isDesktop &&
    !pathname.startsWith("/embed") &&
    pathname !== "/welcome" &&
    !isFormRoute(pathname)
  );
}

/** Create and edit forms with a fixed path. */
const FORM_PATHS: ReadonlySet<string> = new Set([
  "/create",
  "/project/new",
  "/groups/create",
  "/groups/import",
  "/settings/edit-profile",
]);

/**
 * True on a page that is a create or edit form:
 *  - `/create`, `/project/new`, `/groups/create`, `/groups/import`,
 *    `/settings/edit-profile`;
 *  - any `…/edit` (a record's editor, an update's editor) and a group's
 *    `…/edit-profile`;
 *  - `…/update/new` (a new update on a record).
 */
export function isFormRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (FORM_PATHS.has(path)) return true;
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const beforeLast = segments[segments.length - 2];
  if (segments.length >= 2 && (last === "edit" || last === "edit-profile")) return true;
  if (beforeLast === "update" && last === "new") return true;
  return false;
}
