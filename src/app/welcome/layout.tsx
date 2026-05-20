"use client";

import { useProfileNavbar } from "@/lib/navbar-context";

/**
 * Welcome-page chrome — opts the page into the same transparent /
 * fullbleed treatment profile pages use, so the hero / bento /
 * pattern sections render edge-to-edge instead of being capped by
 * the global `.app-shell__content` reading column.
 *
 * NOTE: this branch ships the local `useProfileNavbar` hook for
 * the transparent variant instead of main's `useNavbarVariant`;
 * the layout was adapted to match. Same intent on both sides.
 */
export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useProfileNavbar();
  return <>{children}</>;
}
