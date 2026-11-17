"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, Globe } from "lucide-react"
import BottomSheet from "@/components/ui/bottom-sheet"
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
 * checked: the rail's Network menu on desktop and the pill's Network sheet
 * on phones.
 */
export function NetworkMenuItems({
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
      {networkSectionsFor(isAuthenticated).map(({ key, label, href, icon: Icon }) => (
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
      ))}
    </>
  )
}

/**
 * The phone pill's Network item: looks like the other items (and is
 * current on any Network page), but opens the five pages as a bottom
 * sheet, so Explore, Map and Funding stay one tap away. Also the tour's
 * `nav-network` anchor on phones.
 */
export function PhoneNetworkTab({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useRouteScopedOpen()
  const current = networkSectionFor(usePathname())
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
          <Globe size={22} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
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
