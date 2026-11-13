"use client"

import { useId, useMemo, useRef, useState, type RefObject } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import {
  Check,
  ChevronDown,
  CircleHelp,
  LogIn,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useFeedback } from "@/lib/feedback-context"
import { useOrg } from "@/lib/groups/org-context"
import { sortGroupsForSwitcher } from "@/lib/groups/navigation"
import { useSwitchActor } from "@/lib/groups/use-switch-actor"
import type { Group, OrgRole } from "@/lib/groups/types"
import { useOrgProfile } from "@/hooks/use-org-profile"
import { useProfile } from "@/hooks/use-profile"
import { useSession } from "@/hooks/use-session"
import { useMounted } from "@/hooks/use-mounted"
import { ownProfileUrl } from "@/lib/urls"
import { getInitials } from "@/lib/utils/initials"
import Avatar from "@/components/ui/avatar"
import Badge from "@/components/ui/badge"
import BottomSheet from "@/components/ui/bottom-sheet"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  MENU_ICON_CLASS,
  MENU_SEPARATOR_CLASS,
  menuItemProps,
  menuRowClass,
  type MenuMode,
} from "./menu-row"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import { ORG_ROLE_LABEL } from "./role-label"

// ---------------------------------------------------------------------------
// Who is signed in, and who they act as
// ---------------------------------------------------------------------------

export interface AccountIdentity {
  /** "personal": the signed-in person. "group": a group they act as.
   *  "group-account": the signed-in account is itself a group. */
  kind: "personal" | "group" | "group-account"
  name: string
  handle: string | null
  avatarUrl?: string
  initials: string
  seed?: string
  role?: OrgRole
}

const ROLE_LABEL = ORG_ROLE_LABEL

/** The tag under the current account's name: "Personal" or "Group · Admin". */
export function identityTag(identity: Pick<AccountIdentity, "kind" | "role">): string {
  if (identity.kind === "personal") return "Personal"
  if (identity.kind === "group-account") return "Group account"
  return identity.role ? `Group · ${ROLE_LABEL[identity.role]}` : "Group"
}

/**
 * Everything the account button and menu need: the personal identity, the
 * identity being acted as (the personal one, or the active group), the
 * groups to switch between (sorted), and the current profile link.
 */
export function useAccountState() {
  const { did } = useAuth()
  const { profile, avatarUrl } = useProfile()
  const { handle } = useSession()
  const { activeOrg, groups, selfGroup } = useOrg()
  const { orgAvatarUrl } = useOrgProfile()
  const sortedGroups = useMemo(() => sortGroupsForSwitcher(groups), [groups])

  const personal: AccountIdentity = {
    kind: selfGroup ? "group-account" : "personal",
    name: profile?.displayName || handle || "Your account",
    handle: handle ?? null,
    avatarUrl: avatarUrl || undefined,
    initials: getInitials(profile?.displayName, handle),
    seed: did ?? undefined,
    role: selfGroup?.role,
  }

  const current: AccountIdentity = activeOrg
    ? {
        kind: "group",
        name: activeOrg.displayName || activeOrg.handle,
        handle: activeOrg.handle,
        avatarUrl: orgAvatarUrl || activeOrg.avatarUrl || undefined,
        initials: getInitials(activeOrg.displayName, activeOrg.handle),
        seed: activeOrg.groupDid,
        role: activeOrg.role,
      }
    : personal

  const profileHref = ownProfileUrl({
    activeGroup: activeOrg,
    personalHandle: handle,
    personalDid: did,
  })

  return { personal, current, groups: sortedGroups, activeOrg, selfGroup, profileHref }
}

function IdentityAvatar({
  identity,
  size,
}: {
  identity: AccountIdentity
  size: "sm" | "md"
}) {
  return (
    <Avatar
      size={size}
      shape={identity.kind === "personal" ? "circle" : "square"}
      src={identity.avatarUrl}
      fallbackInitials={identity.initials}
      seed={identity.seed}
    />
  )
}

// ---------------------------------------------------------------------------
// Sign-out confirmation
// ---------------------------------------------------------------------------

/**
 * Sign out behind a confirmation. The dialog is owned by the component that
 * holds the menu trigger (not the menu), so it stays mounted after the menu
 * or sheet closes.
 */
function useSignOutConfirm(returnFocusRef: RefObject<HTMLElement | null>) {
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // The menu item that opens the dialog unmounts with the menu, so focus
  // returns to the account button instead.
  const dialog = open ? (
    <ConfirmDialog
      returnFocusRef={returnFocusRef}
      title="Sign out of Certified?"
      message="You'll be signed out on this device. Your account and everything it holds stay as they are."
      confirmLabel="Sign out"
      confirmVariant="primary"
      isConfirming={busy}
      onCancel={() => setOpen(false)}
      onConfirm={async () => {
        setBusy(true)
        try {
          await signOut()
        } finally {
          setBusy(false)
          setOpen(false)
        }
      }}
    />
  ) : null

  return { request: () => setOpen(true), dialog }
}

// ---------------------------------------------------------------------------
// Menu content (shared by the desktop popover and the phone sheet)
// ---------------------------------------------------------------------------

const THEME_OPTIONS: { value: "light" | "dark" | "system"; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

/** The Appearance row: Light / Dark / System. Menu items in a menu,
 *  toggle buttons (`aria-pressed`) in a sheet. */
function AppearanceRow({ mode }: { mode: MenuMode }) {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const labelId = useId()
  const current = mounted ? theme : undefined
  const isMenu = mode === "menu"

  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 ${isMenu ? "min-h-10 py-1" : "min-h-12 py-1.5"}`}
    >
      <span id={labelId} className="text-body-sm font-medium text-[var(--fg-primary)]">
        Appearance
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="inline-flex shrink-0 items-stretch gap-0.5 rounded border border-[var(--border-default)] bg-[var(--bg-sunken)] p-0.5"
      >
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = current === value
          return (
            <button
              key={value}
              type="button"
              {...(isMenu
                ? { role: "menuitemradio", "aria-checked": selected, tabIndex: -1 }
                : { "aria-pressed": selected })}
              onClick={() => setTheme(value)}
              className={`inline-flex items-center gap-1 rounded border-0 px-1.5 text-caption font-medium cursor-pointer transition-colors duration-fast motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-[-2px] ${
                // 44px in the sheet: the touch minimum.
                isMenu ? "min-h-7" : "min-h-control-md"
              } ${
                selected
                  ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]"
                  : "bg-transparent text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
              }`}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** One account in the "Switch account" list. */
function AccountRow({
  mode,
  identity,
  role,
  current,
  onSelect,
}: {
  mode: MenuMode
  identity: AccountIdentity
  role?: OrgRole
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
      {role ? <Badge variant="role">{ROLE_LABEL[role]}</Badge> : null}
      <Check
        size={16}
        strokeWidth={2}
        aria-hidden
        className={`shrink-0 ${current ? "text-[var(--fg-primary)]" : "invisible"}`}
      />
    </button>
  )
}

export interface AccountMenuContentProps {
  mode: MenuMode
  /** Close the popover / sheet (called before every action). */
  onClose: () => void
  /** Ask for the sign-out confirmation. */
  onRequestSignOut: () => void
}

/**
 * The account menu (DESIGN.md §4): the current account and its profile,
 * switching between your personal account and your groups, Settings, Help,
 * feedback and appearance, then signing in as someone else or out.
 *
 * One component for both presentations: inside `<PopoverContent>`
 * (role="menu") on desktop and inside a `<BottomSheet>` on phones.
 */
export function AccountMenuContent({ mode, onClose, onRequestSignOut }: AccountMenuContentProps) {
  const { openSignIn } = useAuth()
  const { openFeedback } = useFeedback()
  const switchActor = useSwitchActor()
  const { personal, current, groups, activeOrg, selfGroup, profileHref } = useAccountState()
  const switchHeadingId = useId()
  const isMenu = mode === "menu"
  const item = menuItemProps(mode)
  const row = (extra?: string) => menuRowClass(mode, extra)
  const separator = isMenu ? (
    <div role="separator" className={MENU_SEPARATOR_CLASS} />
  ) : (
    <hr className={MENU_SEPARATOR_CLASS} />
  )

  const select = (next: Group | null) => {
    onClose()
    const isCurrent = next ? activeOrg?.groupDid === next.groupDid : !activeOrg
    if (!isCurrent) switchActor(next)
  }

  const SwitchHeading = isMenu ? "p" : "h3"

  return (
    <div className="flex flex-col">
      {/* 1. The current account. Presentational inside the menu: the
          trigger's label already names it, and View profile is the first
          item. */}
      <div className="flex items-start gap-3 px-3 pb-2 pt-2" role={isMenu ? "none" : undefined}>
        <IdentityAvatar identity={current} size="md" />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-headline text-h4 text-[var(--fg-primary)]">
            {current.name}
          </p>
          {current.handle ? (
            <p className="m-0 truncate text-ui text-[var(--fg-muted)]">@{current.handle}</p>
          ) : null}
          {activeOrg && personal.handle ? (
            <p className="m-0 truncate text-ui text-[var(--fg-muted)]">
              as @{personal.handle}
            </p>
          ) : null}
          <div className="mt-1.5">
            <Badge variant="tag">{identityTag(current)}</Badge>
          </div>
        </div>
      </div>
      <Link href={profileHref} {...item} className={row()} onClick={onClose}>
        <UserRound size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
        View profile
      </Link>

      {/* 2. Switch account: personal first, then groups; New group after
          a separator. Hidden for an account that is itself a group
          (nothing to switch to inside it). */}
      {!selfGroup ? (
        <>
          {separator}
          <div
            role={isMenu ? "group" : undefined}
            aria-labelledby={switchHeadingId}
            className="flex flex-col"
          >
            <SwitchHeading
              id={switchHeadingId}
              className="m-0 px-3 pb-1 pt-2 text-label text-[var(--fg-muted)]"
            >
              Switch account
            </SwitchHeading>
            <AccountRow
              mode={mode}
              identity={personal}
              current={!activeOrg}
              onSelect={() => select(null)}
            />
            {groups.map((group) => (
              <AccountRow
                key={group.groupDid}
                mode={mode}
                identity={{
                  kind: "group",
                  name: group.displayName || group.handle,
                  handle: group.handle,
                  avatarUrl: group.avatarUrl,
                  initials: getInitials(group.displayName, group.handle),
                  seed: group.groupDid,
                }}
                role={group.role}
                current={activeOrg?.groupDid === group.groupDid}
                onSelect={() => select(group)}
              />
            ))}
          </div>
          {/* After its own hairline, so it doesn't read as an account to
              switch to. */}
          {separator}
          <Link href="/groups/create" {...item} className={row()} onClick={onClose}>
            <Plus size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
            New group
          </Link>
        </>
      ) : null}

      {/* 3. Settings, Help, feedback, appearance. */}
      {separator}
      <Link href="/settings" {...item} className={row()} onClick={onClose}>
        <Settings size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
        Settings
      </Link>
      <Link href="/help" {...item} className={row()} onClick={onClose}>
        <CircleHelp size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
        Help
      </Link>
      <button
        type="button"
        {...item}
        className={row()}
        onClick={() => {
          onClose()
          openFeedback()
        }}
      >
        <MessageSquare size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
        Send feedback
      </button>
      <AppearanceRow mode={mode} />

      {/* 4. Session. "Sign in with another account" replaces this session,
          so it says so. */}
      {separator}
      <button
        type="button"
        {...item}
        className={row()}
        onClick={() => {
          onClose()
          void openSignIn()
        }}
      >
        <LogIn size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block">Sign in with another account</span>
          {personal.handle ? (
            <span className="block truncate text-caption font-normal text-[var(--fg-muted)]">
              Signs you out of @{personal.handle}
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        {...item}
        className={row()}
        onClick={() => {
          onClose()
          onRequestSignOut()
        }}
      >
        <LogOut size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
        Sign out
      </button>

      {/* The sheet replaces the old phone drawer, which carried the legal
          links; the desktop keeps them in the site footer. */}
      {!isMenu ? (
        <nav
          aria-label="Legal"
          className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-subtle)] px-3 pt-3 text-caption"
        >
          {[
            { href: "/terms", label: "Terms" },
            { href: "/privacy", label: "Privacy" },
            { href: "/imprint", label: "Imprint" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="inline-flex min-h-control-md items-center text-[var(--fg-muted)] no-underline hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
            >
              {label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** The account button's second line: the handle, or "as @you" while
 *  acting as a group. */
function accountButtonSub(current: AccountIdentity, personalHandle: string | null): string | null {
  if (current.kind === "group") return personalHandle ? `as @${personalHandle}` : null
  return current.handle ? `@${current.handle}` : null
}

/** Accessible name for the account button: the visible text first. */
function accountButtonLabel(current: AccountIdentity, personalHandle: string | null): string {
  const sub = accountButtonSub(current, personalHandle)
  return `${current.name}${sub ? `, ${sub}` : ""}, account menu`
}

/**
 * Desktop account button (≥800px): avatar, name and handle (the text from
 * 1100px). Acting as a group it shows the group, its avatar square, and
 * "as @you". Opens the account menu in a popover.
 */
export function DesktopAccountMenu() {
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const signOut = useSignOutConfirm(triggerRef)
  const { current, personal } = useAccountState()
  const sub = accountButtonSub(current, personal.handle)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <button
            ref={triggerRef}
            type="button"
            className="account-button"
            aria-label={accountButtonLabel(current, personal.handle)}
            data-tour="account-menu"
          >
            <IdentityAvatar identity={current} size="sm" />
            <span className="account-button__meta" aria-hidden>
              <span className="account-button__name">{current.name}</span>
              {sub ? <span className="account-button__sub">{sub}</span> : null}
            </span>
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="account-button__chevron" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          portal
          side="bottom"
          align="end"
          offset={8}
          minWidth={300}
          aria-label="Account"
          className="w-[336px] max-h-[calc(100dvh-80px)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
          style={{ zIndex: "var(--z-chrome-menu)" }}
        >
          <AccountMenuContent
            mode="menu"
            onClose={() => setOpen(false)}
            onRequestSignOut={signOut.request}
          />
        </PopoverContent>
      </Popover>
      {signOut.dialog}
    </>
  )
}

/**
 * Phone account button (below 800px): the acting account's avatar (square
 * for a group) in the top bar. Opens the account menu as a bottom sheet
 * titled "Account".
 */
export function PhoneAccountMenu() {
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const signOut = useSignOutConfirm(triggerRef)
  const { current, personal } = useAccountState()

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label={accountButtonLabel(current, personal.handle)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-tour="account-menu"
      >
        <IdentityAvatar identity={current} size="sm" />
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Account"
        returnFocusRef={triggerRef}
      >
        <div className="px-2 pb-4">
          <AccountMenuContent
            mode="sheet"
            onClose={() => setOpen(false)}
            onRequestSignOut={signOut.request}
          />
        </div>
      </BottomSheet>
      {signOut.dialog}
    </>
  )
}
