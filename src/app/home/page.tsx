"use client"

import { usePageTitle } from "@/lib/navbar-context"

/**
 * Placeholder Home page for the new site-drawer nav. Empty by
 * design — the surface will get content once the home composition
 * is decided. Until then we just register the navbar title.
 */
export default function HomePage() {
  usePageTitle("Home")
  return <div className="home-page" />
}
