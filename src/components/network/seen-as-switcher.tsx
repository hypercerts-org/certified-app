"use client"

import { useId, useRef } from "react"
import { ChevronDown } from "lucide-react"
import BottomSheet from "@/components/ui/bottom-sheet"
import Button from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { IdentityAvatar } from "@/components/layout/account-menu"
import type { MenuMode } from "@/components/layout/menu-row"
import { groupIdentity, useWorkspaceState, WorkspaceRow } from "@/components/layout/workspace-menu"
import { useAuth } from "@/lib/auth/auth-context"
import { useSeenAs } from "@/lib/groups/seen-as"
import type { Group } from "@/lib/groups/types"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"

/** What the switcher calls your personal account. */
export const SEEN_AS_ME = "Me"

/**
 * The list: you ("Me") first, then each of your groups, the current one
 * checked, and a line saying it leaves the workspace alone.
 */
function SeenAsItems({ mode, onClose }: { mode: MenuMode; onClose: () => void }) {
  const { personal, groups } = useWorkspaceState()
  const { seenAs, setSeenAs } = useSeenAs()
  const noteId = useId()
  const select = (next: Group | null) => {
    onClose()
    setSeenAs(next)
  }
  return (
    <div className="flex flex-col">
      <div
        role={mode === "menu" ? "group" : undefined}
        aria-label="Seen as"
        aria-describedby={noteId}
        className="flex flex-col"
      >
        <WorkspaceRow
          mode={mode}
          identity={{ ...personal, name: SEEN_AS_ME }}
          current={!seenAs}
          onSelect={() => select(null)}
        />
        {groups.map((group) => (
          <WorkspaceRow
            key={group.groupDid}
            mode={mode}
            identity={groupIdentity(group)}
            current={seenAs?.groupDid === group.groupDid}
            onSelect={() => select(group)}
          />
        ))}
      </div>
      <p id={noteId} className="m-0 px-3 pb-1 pt-2 text-caption text-[var(--fg-muted)]">
        Changes what Feed and Explore show, not your workspace.
      </p>
    </div>
  )
}

/**
 * "Seen as", right after the Feed and Explore titles: which account the
 * network is shown for, you ("Me") or one of your groups, and a way to
 * switch. Its own setting (`useSeenAs`), separate from the workspace:
 * picking here never changes the workspace, and the Workspace menu never
 * changes this. Shown only to a signed-in person in at least one group:
 * with one account there is nothing to pick. A `<Popover>` menu on
 * desktop, a `<BottomSheet>` on phones.
 */
export default function SeenAsSwitcher() {
  const { isAuthenticated } = useAuth()
  const { personal, canSwitch } = useWorkspaceState()
  const { seenAs } = useSeenAs()
  const { isDesktop } = useLayoutBreakpoints()
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)

  if (!isAuthenticated || !canSwitch) return null

  const identity = seenAs ? groupIdentity(seenAs) : personal
  const name = seenAs ? identity.name : SEEN_AS_ME
  // The visible text is the accessible name: "Seen as Me".
  const content = (
    <>
      <span className="font-normal text-[var(--fg-muted)]">Seen as</span>
      <IdentityAvatar identity={identity} size="xs" />
      <span className="max-w-[160px] truncate">{name}</span>
      <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="text-[var(--fg-muted)]" />
    </>
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
          aria-label="Seen as"
          className="max-h-[calc(100dvh-80px)] overflow-y-auto overscroll-contain"
        >
          <SeenAsItems mode="menu" onClose={() => setOpen(false)} />
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
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Seen as"
        returnFocusRef={triggerRef}
      >
        <div className="px-2 pb-4">
          <SeenAsItems mode="sheet" onClose={() => setOpen(false)} />
        </div>
      </BottomSheet>
    </>
  )
}
