"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Check,
  ChevronDown,
  Compass,
  Globe,
  HandCoins,
  MapIcon,
  Network,
  Newspaper,
  type LucideIcon,
} from "lucide-react"
import BottomSheet from "@/components/ui/bottom-sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import { isDestinationActive } from "@/lib/layout/destinations"
import { MENU_ICON_CLASS, menuItemProps, menuRowClass, type MenuMode } from "./menu-row"

/** The Network's pages, in menu order. */
export type NetworkSection = "feed" | "explore" | "graph" | "map" | "funding"

export const NETWORK_SECTIONS: readonly {
  key: NetworkSection
  label: string
  href: string
  icon: LucideIcon
  /** Signed-in only (the Feed follows your account). */
  requiresAuth?: boolean
}[] = [
  { key: "feed", label: "Feed", href: "/feed", icon: Newspaper, requiresAuth: true },
  { key: "explore", label: "Explore", href: "/explore", icon: Compass },
  { key: "graph", label: "Graph", href: "/graph", icon: Network },
  { key: "map", label: "Map", href: "/map", icon: MapIcon },
  { key: "funding", label: "Funding", href: "/funding", icon: HandCoins },
]

/** The Network page `pathname` is on, if any. */
function currentSection(pathname: string | null): NetworkSection | null {
  return NETWORK_SECTIONS.find((s) => isDestinationActive(s, pathname))?.key ?? null
}

/** The pages as menu rows (no Feed signed out), the current one checked. */
function NetworkMenuItems({
  mode,
  isAuthenticated,
  current,
  onSelect,
}: {
  mode: MenuMode
  isAuthenticated: boolean
  current: NetworkSection | null
  onSelect: () => void
}) {
  return (
    <>
      {NETWORK_SECTIONS.filter((s) => !s.requiresAuth || isAuthenticated).map(
        ({ key, label, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            {...menuItemProps(mode)}
            className={menuRowClass(mode)}
            aria-current={key === current ? "page" : undefined}
            onClick={onSelect}
          >
            <Icon size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
            <span className="flex-1">{label}</span>
            {key === current ? (
              <Check size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
            ) : null}
          </Link>
        ),
      )}
    </>
  )
}

/**
 * The desktop top bar's Network button (DESIGN.md §4): opens a menu of the
 * Network's five pages (Feed, Explore, Graph, Map, Funding). Styled like the other
 * destinations, and current on any Network page. Also the product tour's
 * `nav-network` anchor.
 */
export function DesktopNetworkMenu({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useRouteScopedOpen()
  const current = currentSection(usePathname())
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
        <NetworkMenuItems
          mode="menu"
          isAuthenticated={isAuthenticated}
          current={current}
          onSelect={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The phone tab bar's Network tab: looks like the other tabs (and is
 * current on any Network page), but opens the five pages as a bottom
 * sheet, the same list as the desktop menu. Also the tour's `nav-network`
 * anchor on phones.
 */
export function PhoneNetworkTab({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useRouteScopedOpen()
  const current = currentSection(usePathname())
  const active = current !== null
  return (
    <>
      <button
        type="button"
        className={`bottom-nav__item${active ? " bottom-nav__item--active" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(true)}
        data-tour="nav-network"
      >
        <span className="bottom-nav__icon-wrap">
          <Globe size={24} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
        </span>
        <span className="bottom-nav__label">Network</span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Network">
        <div className="flex flex-col gap-0.5 px-2 pb-4">
          <NetworkMenuItems
            mode="sheet"
            isAuthenticated={isAuthenticated}
            current={current}
            onSelect={() => setOpen(false)}
          />
        </div>
      </BottomSheet>
    </>
  )
}
