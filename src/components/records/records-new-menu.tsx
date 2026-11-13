"use client"

import Link from "next/link"
import { ChevronDown, FileBadge, FolderKanban, ListChecks, Plus, type LucideIcon } from "lucide-react"
import Button from "@/components/ui/button"
import BottomSheet from "@/components/ui/bottom-sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import {
  MENU_ICON_CLASS,
  menuItemProps,
  menuRowClass,
  type MenuMode,
} from "@/components/layout/menu-row"

interface NewItem {
  key: "activity" | "project" | "list"
  href: string
  label: string
  icon: LucideIcon
}

const ITEMS: readonly NewItem[] = [
  { key: "activity", href: "/create", label: "New activity", icon: FileBadge },
  { key: "project", href: "/project/new", label: "New project", icon: FolderKanban },
  // Lists are created in the Lists pane, one kind at a time.
  { key: "list", href: "/records?kind=lists", label: "New list", icon: ListChecks },
]

function Items({
  first,
  mode,
  onSelect,
}: {
  first: NewItem["key"]
  mode: MenuMode
  onSelect: () => void
}) {
  // The current view's kind comes first.
  const ordered = [...ITEMS].sort((a, b) => Number(b.key === first) - Number(a.key === first))
  return (
    <>
      {ordered.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
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
 * The Records page's "New" button: a menu of what you can add here (New
 * activity, New project, New list), as a popover on desktop and a bottom
 * sheet on phones, like the top bar's New menu.
 */
export default function RecordsNewMenu({ first }: { first: NewItem["key"] }) {
  const { isDesktop } = useLayoutBreakpoints()
  const [open, setOpen] = useRouteScopedOpen()
  const trigger = (
    <Button
      variant="primary"
      size="sm"
      onClick={isDesktop ? undefined : () => setOpen(true)}
      aria-haspopup={isDesktop ? undefined : "dialog"}
      aria-expanded={isDesktop ? undefined : open}
    >
      <Plus size={16} strokeWidth={2} aria-hidden />
      New
      <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
    </Button>
  )
  if (!isDesktop) {
    return (
      <>
        {trigger}
        <BottomSheet open={open} onClose={() => setOpen(false)} title="New">
          <div className="flex flex-col gap-0.5 px-2 pb-4">
            <Items first={first} mode="sheet" onSelect={() => setOpen(false)} />
          </div>
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>{trigger}</PopoverTrigger>
      <PopoverContent portal side="bottom" align="end" offset={8} minWidth={200} aria-label="New">
        <Items first={first} mode="menu" onSelect={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
