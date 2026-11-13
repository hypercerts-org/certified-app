/**
 * Welcome-page chrome — the page renders edge-to-edge (the app shell
 * skips its reading column on /welcome). The only chrome is the minimal
 * LandingTopBar (wordmark + sign-in / open-app button), rendered by
 * LandingPage itself. The full app navbar, bottom-nav and desktop-top-bar
 * all return null on /welcome, so this pared-back chrome is identical at
 * every width (mobile and desktop).
 *
 * The site footer is rendered by AppShell after `<main>` (on the landing's
 * off-white `.welcome-footer` band), so it is the contentinfo landmark.
 */
export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
