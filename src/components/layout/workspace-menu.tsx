"use client"

import { useId, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Check, ChevronDown, FolderOpen, Plus, Settings } from "lucide-react"
import Button from "@/components/ui/button"
import BottomSheet from "@/components/ui/bottom-sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import { useOrg } from "@/lib/groups/org-context"
import { accountSettingsHref, routeForActorSwitch } from "@/lib/groups/navigation"
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

/** What your own workspace is called. Not your name: the account button,
 *  right beside it, already shows that. */
export const PERSONAL_WORKSPACE_LABEL = "My workspace"

/**
 * The workspace being worked in (the personal account, or the group acted
 * as), what to call it, the ones to switch between, and whether there is a
 * choice at all: an account that belongs to no group, or is itself a
 * group, has one workspace, so Workspace stays a plain link.
 */
export function useWorkspaceState() {
  const { current, personal, groups, activeOrg, selfGroup } = useAccountState()
  const canSwitch = !selfGroup && groups.length > 0
  // A group's workspace is named after the group; yours is "My
  // workspace"; an account that is itself a group just has "Workspace".
  const isGroup = current.kind === "group"
  const label = isGroup
    ? current.name
    : current.kind === "personal"
      ? PERSONAL_WORKSPACE_LABEL
      : "Workspace"
  return { current, personal, groups, activeOrg, canSwitch, isGroup, label }
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

/** One workspace in the menu: avatar, name, then @handle · role, a check on the
 *  current one. Also the rows of the account pickers ("Seen as", Settings'
 *  "for"). With `settings`, a gear after the row opens that account's
 *  settings (the Workspace menu): its own menu item, not part of the row,
 *  so the row still just switches. */
export function WorkspaceRow({
  mode,
  identity,
  current,
  onSelect,
  settings,
}: {
  mode: MenuMode
  identity: AccountIdentity
  current: boolean
  onSelect: () => void
  settings?: { href: string; label: string; onNavigate: () => void }
}) {
  const isMenu = mode === "menu"
  // The role is quiet, in the secondary line ("@earth.org · Owner"), so it
  // doesn't outshout the names.
  const role = identity.kind === "group" && identity.role ? ORG_ROLE_LABEL[identity.role] : null
  const secondary = [identity.handle ? `@${identity.handle}` : null, role].filter(Boolean).join(" · ")
  const row = (
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

/**
 * The menu (desktop popover) or sheet (phones) content: your personal
 * workspace, then each group's, the current one checked, each with a gear
 * to its settings; then New group. (Settings themselves switch between
 * you and your groups with the "for" picker after their title.)
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
          identity={{ ...personal, name: PERSONAL_WORKSPACE_LABEL }}
          current={!activeOrg}
          onSelect={() => select(null)}
          settings={{ href: accountSettingsHref(null), label: "Your settings", onNavigate: onClose }}
        />
        {groups.map((group) => {
          const identity = groupIdentity(group)
          return (
            <WorkspaceRow
              key={group.groupDid}
              mode={mode}
              identity={identity}
              current={activeOrg?.groupDid === group.groupDid}
              onSelect={() => select(group)}
              settings={{
                href: accountSettingsHref(group),
                label: `${identity.name} settings`,
                onNavigate: onClose,
              }}
            />
          )
        })}
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

/** The trigger's content: the workspace icon (yours) or the group's square
 *  avatar, then its name. The visual hides at 800–1099px, like the other
 *  destinations' icons. */
function WorkspaceLabel({
  identity,
  isGroup,
  label,
}: {
  identity: AccountIdentity
  isGroup: boolean
  label: string
}) {
  return (
    <>
      <span className="desktop-top-bar__workspace-visual" aria-hidden>
        {isGroup ? (
          <IdentityAvatar identity={identity} size="xs" />
        ) : (
          <FolderOpen size={20} strokeWidth={1.5} />
        )}
      </span>
      <span className="desktop-top-bar__workspace-name">{label}</span>
    </>
  )
}

/**
 * The desktop top bar's Workspace (DESIGN.md §4): a fixed-width pill
 * naming the workspace you are in ("My workspace", or the group you
 * act as, with its avatar), that opens a menu to switch between your
 * workspaces, like Network opens its pages. With only one workspace it is
 * a plain link to the Overview. Current on the Overview and the Records
 * sections; the tour's `nav-workspace` anchor.
 */
export function DesktopWorkspaceMenu() {
  const [open, setOpen] = useRouteScopedOpen()
  const pathname = usePathname()
  const { current, canSwitch, isGroup, label: text } = useWorkspaceState()
  const active = isDestinationActive(WORKSPACE, pathname)
  // The visible text first; a group's name says it's a workspace.
  const label = isGroup ? `${text}, workspace` : text

  if (!canSwitch) {
    return (
      <Link
        href={WORKSPACE.href}
        className="desktop-top-bar__nav-link desktop-top-bar__workspace"
        aria-current={active ? "page" : undefined}
        aria-label={label}
        data-tour="nav-workspace"
      >
        <WorkspaceLabel identity={current} isGroup={isGroup} label={text} />
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
          <WorkspaceLabel identity={current} isGroup={isGroup} label={text} />
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
 * The phone tab bar's Workspace tab: the workspace icon over "Workspace"
 * in your own workspace, the group's square avatar in a group's, so the
 * tab shows when you act as a group. With more than one workspace it
 * opens them as a bottom sheet (like the Network tab); otherwise it goes
 * straight to the Overview.
 */
export function PhoneWorkspaceTab() {
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  const { current, canSwitch, isGroup, label: text } = useWorkspaceState()
  const active = isDestinationActive(WORKSPACE, pathname)
  const className = `bottom-nav__item${active ? " bottom-nav__item--active" : ""}`
  const icon = (
    <span className="bottom-nav__icon-wrap">
      {isGroup ? (
        <span className="bottom-nav__avatar">
          <IdentityAvatar identity={current} size="xs" />
        </span>
      ) : (
        <FolderOpen size={24} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
      )}
    </span>
  )
  // The visible label stays "Workspace" (one word per tab), so it leads
  // the accessible name; in a group's workspace, the group follows.
  const label = isGroup ? `Workspace, ${text}` : undefined

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
        aria-label={label}
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
