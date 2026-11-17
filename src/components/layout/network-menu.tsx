"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, Globe } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import {
  NETWORK_SECTIONS,
  networkSectionFor,
  networkSectionsFor,
  type NetworkSection,
} from "@/lib/layout/nav-items"
import { MENU_ICON_CLASS, menuItemProps, menuRowClass, type MenuMode } from "./menu-row"

// The page list lives in lib/layout/nav-items (shared with the sidebar).
export { NETWORK_SECTIONS, type NetworkSection }

/**
 * The Network's pages as menu rows (no Feed signed out), the current one
 * checked: the rail's Network menu on desktop and the pill's on phones.
 * `touch` keeps the menu's roles but makes each row a 44px touch target.
 */
export function NetworkMenuItems({
  mode,
  touch = false,
  isAuthenticated,
  current,
  onSelect,
}: {
  mode: MenuMode
  touch?: boolean
  isAuthenticated: boolean
  current: NetworkSection | null
  onSelect: () => void
}) {
  return (
    <>
      {networkSectionsFor(isAuthenticated).map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          {...menuItemProps(mode)}
          className={menuRowClass(touch ? "sheet" : mode)}
          aria-current={key === current ? "page" : undefined}
          onClick={onSelect}
        >
          <Icon size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
          <span className="flex-1">{label}</span>
          {key === current ? (
            <Check size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
          ) : null}
        </Link>
      ))}
    </>
  )
}

/**
 * The phone pill's Network item: looks like the other items (and is
 * current on any Network page), but opens the five pages as a small menu
 * just above the pill (as the rail's opens beside it on desktop), so
 * Explore, Map and Funding stay one tap away. Also the tour's
 * `nav-network` anchor on phones.
 */
export function PhoneNetworkTab({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useRouteScopedOpen()
  const current = networkSectionFor(usePathname())
  const active = current !== null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <button
          type="button"
          className={`bottom-nav__item${active ? " bottom-nav__item--active" : ""}`}
          aria-current={active ? "page" : undefined}
          data-tour="nav-network"
        >
          <span className="bottom-nav__icon-wrap">
            <Globe size={22} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
          </span>
          <span className="bottom-nav__label">Network</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        portal
        side="top"
        align="center"
        offset={12}
        minWidth={220}
        aria-label="Network"
        style={{ zIndex: "var(--z-chrome-menu)" }}
      >
        <NetworkMenuItems
          mode="menu"
          touch
          isAuthenticated={isAuthenticated}
          current={current}
          onSelect={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
