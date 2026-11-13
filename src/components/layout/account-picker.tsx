"use client"

import { useId, useRef } from "react"
import { ChevronDown } from "lucide-react"
import BottomSheet from "@/components/ui/bottom-sheet"
import Button from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAuth } from "@/lib/auth/auth-context"
import type { Group } from "@/lib/groups/types"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import { IdentityAvatar } from "./account-menu"
import type { MenuMode } from "./menu-row"
import { groupIdentity, useWorkspaceState, WorkspaceRow } from "./workspace-menu"

/** What the pickers call your personal account. */
export const ACCOUNT_PICKER_ME = "Me"

export interface AccountPickerProps {
  /** The words before the account on the button: "Seen as", "for". */
  prefix: string
  /** Names the menu and the phone sheet: "Seen as", "Settings for". */
  label: string
  /** The account picked now: a group, or null for you. */
  current: Group | null
  onSelect: (next: Group | null) => void
  /** One muted line under the list, e.g. what picking changes. */
  note?: string
}

function AccountPickerItems({
  mode,
  label,
  current,
  note,
  onSelect,
}: {
  mode: MenuMode
  label: string
  current: Group | null
  note?: string
  onSelect: (next: Group | null) => void
}) {
  const { personal, groups } = useWorkspaceState()
  const noteId = useId()
  return (
    <div className="flex flex-col">
      <div
        role={mode === "menu" ? "group" : undefined}
        aria-label={label}
        aria-describedby={note ? noteId : undefined}
        className="flex flex-col"
      >
        <WorkspaceRow
          mode={mode}
          identity={{ ...personal, name: ACCOUNT_PICKER_ME }}
          current={!current}
          onSelect={() => onSelect(null)}
        />
        {groups.map((group) => (
          <WorkspaceRow
            key={group.groupDid}
            mode={mode}
            identity={groupIdentity(group)}
            current={current?.groupDid === group.groupDid}
            onSelect={() => onSelect(group)}
          />
        ))}
      </div>
      {note ? (
        <p id={noteId} className="m-0 px-3 pb-1 pt-2 text-caption text-[var(--fg-muted)]">
          {note}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A small account picker for a page heading's `titleAside`: "<prefix>
 * [avatar] Me ▾" (or the group's name), opening a list of you and your
 * groups, the current one checked. Feed and Explore's "Seen as" and
 * Settings' "for" are this. Shown only to a signed-in person in at least
 * one group: with one account there is nothing to pick. A `<Popover>`
 * menu on desktop, a `<BottomSheet>` on phones. Picking the current one
 * just closes it.
 */
export default function AccountPicker({ prefix, label, current, onSelect, note }: AccountPickerProps) {
  const { isAuthenticated } = useAuth()
  const { personal, canSwitch } = useWorkspaceState()
  const { isDesktop } = useLayoutBreakpoints()
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)

  if (!isAuthenticated || !canSwitch) return null

  const identity = current ? groupIdentity(current) : personal
  const name = current ? identity.name : ACCOUNT_PICKER_ME
  const select = (next: Group | null) => {
    setOpen(false)
    const isCurrent = next ? current?.groupDid === next.groupDid : !current
    if (!isCurrent) onSelect(next)
  }
  // The visible text is the accessible name: "Seen as Me", "for Ma Earth".
  const content = (
    <>
      <span className="font-normal text-[var(--fg-muted)]">{prefix}</span>
      <IdentityAvatar identity={identity} size="xs" />
      <span className="max-w-[160px] truncate">{name}</span>
      <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="text-[var(--fg-muted)]" />
    </>
  )
  const items = (mode: MenuMode) => (
    <AccountPickerItems mode={mode} label={label} current={current} note={note} onSelect={select} />
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button ref={triggerRef} variant="secondary" size="sm" className="gap-1.5">
            {content}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          portal
          side="bottom"
          align="start"
          offset={8}
          minWidth={280}
          aria-label={label}
          className="max-h-[calc(100dvh-80px)] overflow-y-auto overscroll-contain"
        >
          {items("menu")}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        className="gap-1.5"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {content}
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={label} returnFocusRef={triggerRef}>
        <div className="px-2 pb-4">{items("sheet")}</div>
      </BottomSheet>
    </>
  )
}
