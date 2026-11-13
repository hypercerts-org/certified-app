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
 */
export function isBottomNavVisible(params: {
  pathname: string;
  isDesktop: boolean;
}): boolean {
  const { pathname, isDesktop } = params;
  return (
    !isDesktop &&
    !pathname.startsWith("/embed") &&
    pathname !== "/welcome"
  );
}
