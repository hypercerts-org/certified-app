"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Check, FolderOpen, Settings } from "lucide-react"
import Button from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import PillMenuScrim from "./pill-menu-scrim"
import { useOrg } from "@/lib/groups/org-context"
import { targetAfterActorSwitch } from "@/lib/groups/navigation"
import type { Group } from "@/lib/groups/types"
import { DESTINATIONS, isDestinationActive } from "@/lib/layout/destinations"
import { WORKSPACE_SECTIONS, workspaceSectionFor, type WorkspaceSection } from "@/lib/layout/nav-items"
import { getInitials } from "@/lib/utils/initials"
import { IdentityAvatar, useAccountState, type AccountIdentity } from "./account-menu"
import { MENU_ICON_CLASS, menuItemProps, menuRowClass, type MenuMode } from "./menu-row"
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
 * Switch who you act as, **in place**: you stay on the page you're on (the
 * Feed and Explore switch to the new account's network, the Overview to
 * its account), unless the page only works for your personal account: the
 * group pages are personal-only, so picking a group there goes to its
 * Overview (`targetAfterActorSwitch`). The Records sections stay: acting
 * as a group, Endorsements and Followers show the group's own, the others
 * say where that group's records are. Switching
 * changes what you create, follow, endorse, like and comment as, and what
 * the Feed and Explore show.
 */
export function useOpenWorkspace() {
  const { activeOrg, switchOrg } = useOrg()
  const router = useRouter()
  const pathname = usePathname()

  return (next: Group | null) => {
    const isCurrent = next ? activeOrg?.groupDid === next.groupDid : !activeOrg
    if (!isCurrent) switchOrg(next)
    const target = targetAfterActorSwitch(pathname, next)
    if (target !== pathname) router.push(target)
  }
}

/** One account in a switcher: avatar, name, then role · @handle (or a
 *  `note` first, e.g. "You · @handle"), a check on the current one. The
 *  rows of the account menu's "Act as" and of the account pickers (the
 *  comment author). With `settings`, a gear after the row opens that
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

// ---------------------------------------------------------------------------
// The phone pill's Workspace
// ---------------------------------------------------------------------------

/** The Workspace's sections as touch-sized menu rows, the current one
 *  checked. */
function WorkspaceSectionItems({
  current,
  touch,
  onSelect,
}: {
  current: WorkspaceSection | null
  touch: boolean
  onSelect: () => void
}) {
  return (
    <>
        {WORKSPACE_SECTIONS.map(({ key, label, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            {...menuItemProps("menu")}
            className={menuRowClass(touch ? "sheet" : "menu")}
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

/** The rows with the current section, read from `?kind=` (only while the
 *  menu is open, in its own Suspense boundary). */
function CurrentWorkspaceSectionItems({ touch, onSelect }: { touch: boolean; onSelect: () => void }) {
  const pathname = usePathname()
  const kind = useSearchParams()?.get("kind") ?? null
  return (
    <WorkspaceSectionItems current={workspaceSectionFor(pathname, kind)} touch={touch} onSelect={onSelect} />
  )
}

/**
 * The Workspace's six sections as menu rows, the current one checked (from
 * the path and `?kind=`, read in its own boundary): the pill's Workspace
 * menu on phones (`touch`: 44px rows) and the rail's on desktop, as
 * `NetworkMenuItems` are Network's.
 */
export function WorkspaceMenuItems({ touch = false, onSelect }: { touch?: boolean; onSelect: () => void }) {
  return (
    <Suspense fallback={<WorkspaceSectionItems current={null} touch={touch} onSelect={onSelect} />}>
      <CurrentWorkspaceSectionItems touch={touch} onSelect={onSelect} />
    </Suspense>
  )
}

/**
 * The phone pill's Workspace item (signed in): opens the Workspace's
 * sections (Overview, Projects and activities, Endorsements, Followers,
 * Lists, Groups) as a small menu just above the pill, like Network's.
 * Always the folder icon: who you act as is the top bar's account
 * control. Current on the Overview and the Records sections; the tour's
 * `nav-workspace` anchor on phones.
 */
export function PhoneWorkspaceTab() {
  const [open, setOpen] = useRouteScopedOpen()
  const active = isDestinationActive(WORKSPACE, usePathname())
  const close = () => setOpen(false)
  return (
    <>
      <PillMenuScrim open={open} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <button
            type="button"
            className={`bottom-nav__item${active ? " bottom-nav__item--active" : ""}`}
            aria-current={active ? "page" : undefined}
            data-tour="nav-workspace"
          >
            <span className="bottom-nav__icon-wrap">
              <FolderOpen size={22} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
            </span>
            <span className="bottom-nav__label">Workspace</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          portal
          side="top"
          align="center"
          // 8px above the pill: its 4px padding and 1px border sit
          // between the item and its edge.
          offset={13}
          collisionPadding={16}
          minWidth={0}
          aria-label="Workspace"
          className="pill-menu"
          style={{ zIndex: "var(--z-chrome-menu)" }}
        >
          <WorkspaceMenuItems touch onSelect={close} />
        </PopoverContent>
      </Popover>
    </>
  )
}
