"use client"

import Link from "next/link"
import { Building2, FileBadge, FolderKanban, Plus, type LucideIcon } from "lucide-react"
import Button from "@/components/ui/button"
import BottomSheet from "@/components/ui/bottom-sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import { MENU_ICON_CLASS, menuItemProps, menuRowClass, type MenuMode } from "./menu-row"

interface NewMenuItem {
  readonly href: string
  readonly label: string
  readonly icon: LucideIcon
}

/** What "New" can make, in menu order. Same list on desktop and phones. */
export const NEW_MENU_ITEMS: readonly NewMenuItem[] = [
  { href: "/create", label: "New activity", icon: FileBadge },
  { href: "/project/new", label: "New project", icon: FolderKanban },
  { href: "/groups/create", label: "New group", icon: Building2 },
]

function NewMenuItems({ mode, onSelect }: { mode: MenuMode; onSelect: () => void }) {
  return (
    <>
      {NEW_MENU_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          {...menuItemProps(mode)}
          className={menuRowClass(mode)}
          onClick={onSelect}
        >
          <Icon size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
          <span>{label}</span>
        </Link>
      ))}
    </>
  )
}

/**
 * Desktop "New" button (≥800px): a primary button that opens a menu of
 * the things you can create. Also the product tour's `nav-create` anchor.
 */
export function DesktopNewMenu() {
  const [open, setOpen] = useRouteScopedOpen()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button variant="primary" size="sm" data-tour="nav-create">
          <Plus size={16} strokeWidth={2} aria-hidden />
          New
        </Button>
      </PopoverTrigger>
      <PopoverContent
        portal
        side="bottom"
        align="end"
        offset={8}
        minWidth={220}
        aria-label="New"
        style={{ zIndex: "var(--z-chrome-menu)" }}
      >
        <NewMenuItems mode="menu" onSelect={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Phone "+" (below 800px): an icon button in the top bar that opens the
 * same list as a bottom sheet. Also the tour's `nav-create` anchor on phones.
 */
export function PhoneNewMenu() {
  const [open, setOpen] = useRouteScopedOpen()
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="New"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-tour="nav-create"
      >
        <Plus size={20} strokeWidth={1.5} aria-hidden />
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="New">
        <div className="flex flex-col gap-0.5 px-2 pb-4">
          <NewMenuItems mode="sheet" onSelect={() => setOpen(false)} />
        </div>
      </BottomSheet>
    </>
  )
}
