"use client"

import { useState } from "react"
import { ChevronDown, FolderGit2, Plus, UserRound } from "lucide-react"
import Button from "@/components/ui/button"
import BottomSheet from "@/components/ui/bottom-sheet"
import CertIcon from "@/components/ui/cert-icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CreateListModal } from "@/components/profile/list-modals"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import { useUrlParam } from "@/hooks/use-url-param"
import {
  LIST_ACCOUNTS_TYPE,
  LIST_CERTS_TYPE,
  LIST_PROJECTS_TYPE,
  createTypedList,
  type TypedListType,
} from "@/lib/atproto/typed-lists"
import { rkeyFromUri } from "@/lib/urls"
import {
  MENU_ICON_CLASS,
  menuItemProps,
  menuRowClass,
  type MenuMode,
} from "@/components/layout/menu-row"

/** Lucide icons and CertIcon share these props. */
type MenuIcon = React.ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
  "aria-hidden"?: boolean
}>

const KINDS: readonly { type: TypedListType; label: string; icon: MenuIcon }[] = [
  { type: LIST_CERTS_TYPE, label: "Activity list", icon: CertIcon },
  { type: LIST_PROJECTS_TYPE, label: "Project list", icon: FolderGit2 },
  { type: LIST_ACCOUNTS_TYPE, label: "Account list", icon: UserRound },
]

function Items({ mode, onPick }: { mode: MenuMode; onPick: (type: TypedListType) => void }) {
  return (
    <>
      {KINDS.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          type="button"
          {...menuItemProps(mode)}
          className={menuRowClass(mode)}
          onClick={() => onPick(type)}
        >
          <Icon size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
          <span>{label}</span>
        </button>
      ))}
    </>
  )
}

/**
 * The Lists pane's "New list" button: pick what the list holds
 * (activities, projects or accounts) from a menu (a popover on desktop, a
 * bottom sheet on phones), name it in the create dialog, and land on the
 * new list. Writing the list bumps the lists cache, so the pane's list
 * manager picks it up.
 */
export default function NewListMenu({ did }: { did: string }) {
  const { isDesktop } = useLayoutBreakpoints()
  const [open, setOpen] = useRouteScopedOpen()
  const [creating, setCreating] = useState<TypedListType | null>(null)
  const [, setListParam] = useUrlParam("list", { mode: "push" })

  const pick = (type: TypedListType) => {
    setOpen(false)
    setCreating(type)
  }

  const trigger = (
    <Button
      variant="secondary"
      size="sm"
      onClick={isDesktop ? undefined : () => setOpen(true)}
      aria-haspopup={isDesktop ? undefined : "dialog"}
      aria-expanded={isDesktop ? undefined : open}
    >
      <Plus size={16} strokeWidth={1.75} aria-hidden />
      New list
      <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
    </Button>
  )

  const modal = creating ? (
    <CreateListModal
      type={creating}
      onCancel={() => setCreating(null)}
      onSubmit={async (title, description) => {
        const ref = await createTypedList(did, creating, title, description)
        setCreating(null)
        const rkey = rkeyFromUri(ref.uri)
        if (rkey) setListParam(rkey)
      }}
    />
  ) : null

  if (!isDesktop) {
    return (
      <>
        {trigger}
        <BottomSheet open={open} onClose={() => setOpen(false)} title="New list">
          <div className="flex flex-col gap-0.5 px-2 pb-4">
            <Items mode="sheet" onPick={pick} />
          </div>
        </BottomSheet>
        {modal}
      </>
    )
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>{trigger}</PopoverTrigger>
        <PopoverContent portal side="bottom" align="end" offset={8} minWidth={200} aria-label="New list">
          <Items mode="menu" onPick={pick} />
        </PopoverContent>
      </Popover>
      {modal}
    </>
  )
}
