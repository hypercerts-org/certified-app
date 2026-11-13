"use client"

import { Compass, MapIcon, Network, Newspaper } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import SideNav, { type SideNavIcon } from "@/components/ui/side-nav"

/** The Network's sections, in tab order. */
export type NetworkSection = "feed" | "explore" | "graph" | "map"

export const NETWORK_SECTIONS: readonly {
  key: NetworkSection
  label: string
  href: string
  icon: SideNavIcon
  /** Signed-in only (the Feed follows your account). */
  requiresAuth?: boolean
  /** `data-tour` anchor for the product tour. */
  tour: string
}[] = [
  { key: "feed", label: "Feed", href: "/feed", icon: Newspaper, requiresAuth: true, tour: "nav-feed" },
  { key: "explore", label: "Explore", href: "/explore", icon: Compass, tour: "nav-explore" },
  { key: "graph", label: "Graph", href: "/graph", icon: Network, tour: "nav-graph" },
  { key: "map", label: "Map", href: "/map", icon: MapIcon, tour: "nav-map" },
]

/**
 * The Network's tabs (DESIGN.md §4): Feed, Explore, Graph and Map — four
 * views of everyone's work, as opposed to your own Workspace. One row of
 * pills at the top of each Network page, at every width (Feed and Explore
 * have columns of their own, so a side list would collide with them).
 * Signed-out visitors don't get Feed, which follows your account.
 */
export default function NetworkNav({
  current,
  className = "",
}: {
  current: NetworkSection
  className?: string
}) {
  const { isLoading, isAuthenticated } = useAuth()
  // While auth resolves, show the public tabs only, so a signed-out visitor
  // never sees Feed flash in.
  const signedIn = !isLoading && isAuthenticated
  return (
    <SideNav
      aria-label="Network"
      orientation="horizontal"
      className={`network-nav ${className}`.trim()}
      items={NETWORK_SECTIONS.filter((s) => !s.requiresAuth || signedIn).map(
        ({ key, label, href, icon, tour }) => ({
          key,
          label,
          href,
          icon,
          tour,
          current: key === current,
        }),
      )}
    />
  )
}
