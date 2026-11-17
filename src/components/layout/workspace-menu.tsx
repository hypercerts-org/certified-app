"use client"

import { usePathname, useRouter } from "next/navigation"
import { Check, Settings } from "lucide-react"
import Button from "@/components/ui/button"
import { useOrg } from "@/lib/groups/org-context"
import { routeForActorSwitch } from "@/lib/groups/navigation"
import type { Group } from "@/lib/groups/types"
import { DESTINATIONS, isDestinationActive } from "@/lib/layout/destinations"
import { getInitials } from "@/lib/utils/initials"
import { IdentityAvatar, useAccountState, type AccountIdentity } from "./account-menu"
import { menuItemProps, menuRowClass, type MenuMode } from "./menu-row"
import { ORG_ROLE_LABEL } from "./role-label"

const WORKSPACE = DESTINATIONS.find((d) => d.key === "workspace")!

/** A group as a workspace row: its name, @handle and square avatar. */
export function groupIdentity(group: Group): AccountIdentity {
  return {
    kind: "group",
    name: group.displayName || group.handle,
    handle: group.handle,
    avatarUrl: group.avatarUrl,
    initials: getInitials(group.displayName, group.handle),
    seed: group.groupDid,
    role: group.role,
  }
}

/**
 * Who you act as (the personal account, or a group), the accounts to
 * switch between, and whether there is a choice at all: an account that
 * belongs to no group, or is itself a group, has nothing to switch.
 */
export function useWorkspaceState() {
  const { current, personal, groups, activeOrg, selfGroup } = useAccountState()
  const canSwitch = !selfGroup && groups.length > 0
  const isGroup = current.kind === "group"
  return { current, personal, groups, activeOrg, canSwitch, isGroup }
}

/**
 * Open a workspace. From outside the Workspace (Network, Apps, Settings…)
 * it goes to that workspace's Overview. Inside it, it stays on the same
 * section when the section works for the new account: the Records
 * sections and Groups are personal-only, so picking a group there goes to
 * its Overview. Switching changes who you act as (what you create, follow
 * and endorse as); what Feed and Explore show is "Seen as", a separate
 * setting (lib/groups/seen-as).
 */
export function useOpenWorkspace() {
  const { activeOrg, switchOrg } = useOrg()
  const router = useRouter()
  const pathname = usePathname()

  return (next: Group | null) => {
    const isCurrent = next ? activeOrg?.groupDid === next.groupDid : !activeOrg
    if (!isCurrent) switchOrg(next)
    const inWorkspace = isDestinationActive(WORKSPACE, pathname)
    const target = !inWorkspace
      ? "/home"
      : next && pathname?.startsWith("/records")
        ? "/home"
        : routeForActorSwitch(pathname, next)
    if (target !== pathname) router.push(target)
  }
}

/** One account in a switcher: avatar, name, then role · @handle (or a
 *  `note` first, e.g. "You · @handle"), a check on the current one. The rows of the
 *  account menu's "Act as" and of the account pickers ("Seen as",
 *  Settings' "for"). With `settings`, a gear after the row opens that
 *  account's settings: its own menu item, not part of the row, so the row
 *  still just switches. `disabled` keeps the row visible but inert (on a
 *  form, where switching would drop the draft). */
export function WorkspaceRow({
  mode,
  identity,
  current,
  onSelect,
  settings,
  note,
  disabled = false,
}: {
  mode: MenuMode
  identity: AccountIdentity
  current: boolean
  onSelect: () => void
  settings?: { href: string; label: string; onNavigate: () => void }
  note?: string
  disabled?: boolean
}) {
  const isMenu = mode === "menu"
  // The role is quiet, in the secondary line ("@earth.org · Owner"), so it
  // doesn't outshout the names.
  const role = identity.kind === "group" && identity.role ? ORG_ROLE_LABEL[identity.role] : null
  // The role (or note) first, so a long @handle is what truncates, as on
  // the Overview's "Your groups".
  const secondary = [note ?? null, role, identity.handle ? `@${identity.handle}` : null]
    .filter(Boolean)
    .join(" · ")
  const row = (
    <button
      type="button"
      {...(isMenu
        ? { role: "menuitemradio", "aria-checked": current, tabIndex: -1 }
        : { "aria-current": current ? ("true" as const) : undefined })}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className={menuRowClass(mode, disabled ? "cursor-default opacity-60" : "")}
    >
      <IdentityAvatar identity={identity} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{identity.name}</span>
        {secondary ? (
          <span className="block truncate text-caption text-[var(--fg-muted)]">{secondary}</span>
        ) : null}
      </span>
      <Check
        size={16}
        strokeWidth={2}
        aria-hidden
        className={`shrink-0 ${current ? "text-[var(--fg-primary)]" : "invisible"}`}
      />
    </button>
  )
  if (!settings) return row
  return (
    <div role={isMenu ? "none" : undefined} className="flex items-center gap-1">
      <div role={isMenu ? "none" : undefined} className="min-w-0 flex-1">
        {row}
      </div>
      <Button
        href={settings.href}
        variant="ghost"
        size={isMenu ? "icon-sm" : "icon"}
        aria-label={settings.label}
        {...menuItemProps(mode)}
        onClick={settings.onNavigate}
        className="shrink-0"
      >
        <Settings size={16} strokeWidth={1.75} aria-hidden />
      </Button>
    </div>
  )
}
