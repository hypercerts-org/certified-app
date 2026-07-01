/**
 * Single source of truth for whether the mobile bottom navigation bar
 * (<BottomNav>) is on screen for the current environment.
 *
 * Shared by <BottomNav>, which renders the bar, and <FeedbackTrigger>,
 * which hides its floating "Feedback" button whenever the bar is present:
 * the bar already carries a Feedback entry, so the floating button would
 * be a redundant second door and would visually overlap the bar.
 *
 * The bar is shown only when ALL of these hold:
 *  - not desktop (<800px): at >=800px the left rail / top bar own
 *    navigation, and the bar's focusable buttons would compete for tab
 *    order, so it unmounts.
 *  - standalone (installed PWA / A2HS web clip): in a regular browser tab
 *    the address bar and OS gestures provide navigation, and the bar
 *    would occlude content (e.g. /welcome for guests).
 *  - not an /embed route: embeds render bare (board-only) inside a
 *    third-party iframe.
 *  - not /welcome: the minimal landing chrome (wordmark + sign-in) has no
 *    bottom nav at any width.
 */
export function isBottomNavVisible(params: {
  pathname: string;
  isDesktop: boolean;
  isStandalone: boolean;
}): boolean {
  const { pathname, isDesktop, isStandalone } = params;
  return (
    !isDesktop &&
    isStandalone &&
    !pathname.startsWith("/embed") &&
    pathname !== "/welcome"
  );
}
