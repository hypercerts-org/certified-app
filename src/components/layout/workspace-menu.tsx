"use client"

import { useId, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Check, ChevronDown, Plus } from "lucide-react"
import Badge from "@/components/ui/badge"
import BottomSheet from "@/components/ui/bottom-sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import { useOrg } from "@/lib/groups/org-context"
import { routeForActorSwitch } from "@/lib/groups/navigation"
import type { Group } from "@/lib/groups/types"
import { DESTINATIONS, isDestinationActive } from "@/lib/layout/destinations"
import { getInitials } from "@/lib/utils/initials"
import { IdentityAvatar, useAccountState, type AccountIdentity } from "./account-menu"
import {
  MENU_ICON_CLASS,
  MENU_SEPARATOR_CLASS,
  menuItemProps,
  menuRowClass,
  type MenuMode,
} from "./menu-row"
import { ORG_ROLE_LABEL } from "./role-label"

const WORKSPACE = DESTINATIONS.find((d) => d.key === "workspace")!

/** A group as a workspace row: its name, @handle and square avatar. */
function groupIdentity(group: Group): AccountIdentity {
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
 * The workspace being worked in (the personal account, or the group acted
 * as), the ones to switch between, and whether there is a choice at all:
 * an account that belongs to no group, or is itself a group, has one
 * workspace, so Workspace stays a plain link.
 */
export function useWorkspaceState() {
  const { current, personal, groups, activeOrg, selfGroup } = useAccountState()
  const canSwitch = !selfGroup && groups.length > 0
  return { current, personal, groups, activeOrg, canSwitch }
}

/**
 * Open a workspace. From outside the Workspace (Network, Apps, Settings…)
 * it goes to that workspace's Overview. Inside it, it stays on the same
 * section when the section works for the new account: the Records
 * sections and Groups are personal-only, so picking a group there goes to
 * its Overview. Switching changes who you act as everywhere (the Feed
 * follows it too).
 */
function useOpenWorkspace() {
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

/** One workspace in the menu: avatar, name, @handle, role, a check on the
 *  current one. */
function WorkspaceRow({
  mode,
  identity,
  current,
  onSelect,
}: {
  mode: MenuMode
  identity: AccountIdentity
  current: boolean
  onSelect: () => void
}) {
  const isMenu = mode === "menu"
  return (
    <button
      type="button"
      {...(isMenu
        ? { role: "menuitemradio", "aria-checked": current, tabIndex: -1 }
        : { "aria-current": current ? ("true" as const) : undefined })}
      onClick={onSelect}
      className={menuRowClass(mode)}
    >
      <IdentityAvatar identity={identity} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{identity.name}</span>
        {identity.handle ? (
          <span className="block truncate text-caption text-[var(--fg-muted)]">
            @{identity.handle}
          </span>
        ) : null}
      </span>
      {identity.kind === "group" && identity.role ? (
        <Badge variant="role">{ORG_ROLE_LABEL[identity.role]}</Badge>
      ) : null}
      <Check
        size={16}
        strokeWidth={2}
        aria-hidden
        className={`shrink-0 ${current ? "text-[var(--fg-primary)]" : "invisible"}`}
      />
    </button>
  )
}

/**
 * The menu (desktop popover) or sheet (phones) content: your personal
 * workspace, then each group's, the current one checked; then New group.
 */
export function WorkspaceMenuItems({ mode, onClose }: { mode: MenuMode; onClose: () => void }) {
  const { personal, groups, activeOrg } = useWorkspaceState()
  const openWorkspace = useOpenWorkspace()
  const headingId = useId()
  const isMenu = mode === "menu"
  const Heading = isMenu ? "p" : "h3"
  const select = (next: Group | null) => {
    onClose()
    openWorkspace(next)
  }

  return (
    <div className="flex flex-col">
      <div role={isMenu ? "group" : undefined} aria-labelledby={headingId} className="flex flex-col">
        <Heading id={headingId} className="m-0 px-3 pb-1 pt-2 text-label text-[var(--fg-muted)]">
          Workspaces
        </Heading>
        <WorkspaceRow
          mode={mode}
          identity={personal}
          current={!activeOrg}
          onSelect={() => select(null)}
        />
        {groups.map((group) => (
          <WorkspaceRow
            key={group.groupDid}
            mode={mode}
            identity={groupIdentity(group)}
            current={activeOrg?.groupDid === group.groupDid}
            onSelect={() => select(group)}
          />
        ))}
      </div>
      {isMenu ? (
        <div role="separator" className={MENU_SEPARATOR_CLASS} />
      ) : (
        <hr className={MENU_SEPARATOR_CLASS} />
      )}
      <Link href="/groups/create" {...menuItemProps(mode)} className={menuRowClass(mode)} onClick={onClose}>
        <Plus size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
        New group
      </Link>
    </div>
  )
}

/** The trigger's text: the workspace's avatar and name. The accessible
 *  name starts with the visible name and says what it is. */
function WorkspaceLabel({ identity }: { identity: AccountIdentity }) {
  return (
    <>
      <IdentityAvatar identity={identity} size="xs" />
      <span className="desktop-top-bar__workspace-name">{identity.name}</span>
    </>
  )
}

/**
 * The desktop top bar's Workspace (DESIGN.md §4): it names the workspace
 * you are in (your personal account, or the group you act as) with its
 * avatar, and opens a menu to switch between your workspaces, like
 * Network opens its pages. With only one workspace it is a plain link to
 * the Overview. Current on the Overview and the Records sections; the
 * tour's `nav-workspace` anchor.
 */
export function DesktopWorkspaceMenu() {
  const [open, setOpen] = useRouteScopedOpen()
  const pathname = usePathname()
  const { current, canSwitch } = useWorkspaceState()
  const active = isDestinationActive(WORKSPACE, pathname)
  const label = `${current.name}, workspace`

  if (!canSwitch) {
    return (
      <Link
        href={WORKSPACE.href}
        className="desktop-top-bar__nav-link desktop-top-bar__workspace"
        aria-current={active ? "page" : undefined}
        aria-label={label}
        data-tour="nav-workspace"
      >
        <WorkspaceLabel identity={current} />
      </Link>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <button
          type="button"
          className="desktop-top-bar__nav-link desktop-top-bar__workspace"
          data-current={active ? "" : undefined}
          aria-label={`${label}, switch workspace`}
          data-tour="nav-workspace"
        >
          <WorkspaceLabel identity={current} />
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
        minWidth={280}
        aria-label="Workspaces"
        className="max-h-[calc(100dvh-80px)] overflow-y-auto overscroll-contain"
        style={{ zIndex: "var(--z-chrome-menu)" }}
      >
        <WorkspaceMenuItems mode="menu" onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The phone tab bar's Workspace tab: the workspace's avatar over
 * "Workspace", so the tab shows whose workspace it is. With more than one
 * workspace it opens them as a bottom sheet (like the Network tab);
 * otherwise it goes straight to the Overview.
 */
export function PhoneWorkspaceTab() {
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  const { current, canSwitch } = useWorkspaceState()
  const active = isDestinationActive(WORKSPACE, pathname)
  const className = `bottom-nav__item${active ? " bottom-nav__item--active" : ""}`
  const icon = (
    <span className="bottom-nav__icon-wrap">
      <span className="bottom-nav__avatar">
        <IdentityAvatar identity={current} size="xs" />
      </span>
    </span>
  )
  // The visible label stays "Workspace" (one word per tab), so it leads
  // the accessible name, followed by whose workspace it is.
  const label = `Workspace, ${current.name}`

  if (!canSwitch) {
    return (
      <Link
        href={WORKSPACE.href}
        className={className}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        data-tour="nav-workspace"
        onClick={(e) => {
          if (pathname !== WORKSPACE.href) return
          e.preventDefault()
          const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
        }}
      >
        {icon}
        <span className="bottom-nav__label">Workspace</span>
      </Link>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        aria-label={`${label}, switch workspace`}
        onClick={() => setOpen(true)}
        data-tour="nav-workspace"
      >
        {icon}
        <span className="bottom-nav__label">Workspace</span>
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Workspace"
        returnFocusRef={triggerRef}
      >
        <div className="px-2 pb-4">
          <WorkspaceMenuItems mode="sheet" onClose={() => setOpen(false)} />
        </div>
      </BottomSheet>
    </>
  )
}
