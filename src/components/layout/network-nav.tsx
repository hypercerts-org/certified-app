"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Check,
  ChevronDown,
  Compass,
  Globe,
  MapIcon,
  Network,
  Newspaper,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import SideNav from "@/components/ui/side-nav"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import { isDestinationActive } from "@/lib/layout/destinations"
import { MENU_ICON_CLASS, menuItemProps, menuRowClass } from "./menu-row"

/** The Network's sections, in tab order. */
export type NetworkSection = "feed" | "explore" | "graph" | "map"

export const NETWORK_SECTIONS: readonly {
  key: NetworkSection
  label: string
  href: string
  icon: LucideIcon
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

/** The section `pathname` is on, if it's a Network page. */
function currentSection(pathname: string | null): NetworkSection | null {
  return NETWORK_SECTIONS.find((s) => isDestinationActive(s, pathname))?.key ?? null
}

/**
 * The desktop top bar's Network button: opens a menu of the four Network
 * pages (Feed, Explore, Graph, Map; no Feed when signed out), with the
 * current one checked. Styled like the other destinations, current on any
 * Network page. Also the product tour's `nav-network` anchor.
 */
export function DesktopNetworkMenu({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useRouteScopedOpen()
  const pathname = usePathname()
  const current = currentSection(pathname)
  const sections = NETWORK_SECTIONS.filter((s) => !s.requiresAuth || isAuthenticated)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <button
          type="button"
          className="desktop-top-bar__nav-link"
          data-current={current ? "" : undefined}
          data-tour="nav-network"
        >
          <Globe size={20} strokeWidth={1.5} aria-hidden />
          <span>Network</span>
          {/* In a span: the destination icons hide at 800-1099px, the
              chevron that says "this opens a menu" stays. */}
          <span className="desktop-top-bar__chevron" aria-hidden>
            <ChevronDown size={14} strokeWidth={1.75} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        portal
        side="bottom"
        align="start"
        offset={8}
        minWidth={200}
        aria-label="Network"
        style={{ zIndex: "var(--z-chrome-menu)" }}
      >
        {sections.map(({ key, label, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            {...menuItemProps("menu")}
            className={menuRowClass("menu")}
            aria-current={key === current ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <Icon size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
            <span className="flex-1">{label}</span>
            {key === current ? (
              <Check size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
            ) : null}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  )
}
