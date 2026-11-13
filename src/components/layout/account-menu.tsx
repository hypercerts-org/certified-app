"use client"

import { useMemo, useRef, useState, type RefObject } from "react"
import Link from "next/link"
import {
  ChevronDown,
  CircleHelp,
  LogIn,
  LogOut,
  MessageSquare,
  Settings,
  UserRound,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useFeedback } from "@/lib/feedback-context"
import { useOrg } from "@/lib/groups/org-context"
import { sortGroupsForSwitcher } from "@/lib/groups/navigation"
import type { OrgRole } from "@/lib/groups/types"
import { useOrgProfile } from "@/hooks/use-org-profile"
import { useProfile } from "@/hooks/use-profile"
import { useSession } from "@/hooks/use-session"
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
 * The signed-in account and who it acts as: `personal` (the person signed
 * in; what the account button and menu show) and `current` (the personal
 * account, or the group whose workspace is open; what the Workspace menu
 * shows), the groups to switch between (sorted), and the personal
 * profile link.
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

  // The account menu's "View profile": always your own profile, whichever
  // workspace is open.
  const profileHref = ownProfileUrl({
    activeGroup: null,
    personalHandle: handle,
    personalDid: did,
  })

  return { personal, current, groups: sortedGroups, activeOrg, selfGroup, profileHref }
}

/** An account's avatar: round for a person, square for a group. */
export function IdentityAvatar({
  identity,
  size,
}: {
  identity: AccountIdentity
  size: "xs" | "sm" | "md"
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

export interface AccountMenuContentProps {
  mode: MenuMode
  /** Close the popover / sheet (called before every action). */
  onClose: () => void
  /** Ask for the sign-out confirmation. */
  onRequestSignOut: () => void
}

/**
 * The account menu (DESIGN.md §4): the signed-in account and its profile,
 * Settings, Help and feedback, then signing in as someone else or out. It
 * is always about you, the person signed in, whichever workspace is open:
 * switching between your account and your groups (and a group's settings)
 * is the Workspace menu's job (`workspace-menu.tsx`). Appearance is in
 * Settings.
 *
 * One component for both presentations: inside `<PopoverContent>`
 * (role="menu") on desktop and inside a `<BottomSheet>` on phones.
 */
export function AccountMenuContent({ mode, onClose, onRequestSignOut }: AccountMenuContentProps) {
  const { openSignInAnotherAccount } = useAuth()
  const { openFeedback } = useFeedback()
  const { personal, profileHref } = useAccountState()
  const isMenu = mode === "menu"
  const item = menuItemProps(mode)
  const row = (extra?: string) => menuRowClass(mode, extra)
  const separator = isMenu ? (
    <div role="separator" className={MENU_SEPARATOR_CLASS} />
  ) : (
    <hr className={MENU_SEPARATOR_CLASS} />
  )

  return (
    <div className="flex flex-col">
      {/* 1. You, the signed-in account. Presentational inside the menu:
          the trigger's label already names it, and View profile is the
          first item. */}
      <div className="flex items-start gap-3 px-3 pb-2 pt-2" role={isMenu ? "none" : undefined}>
        <IdentityAvatar identity={personal} size="md" />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-headline text-h4 text-[var(--fg-primary)]">
            {personal.name}
          </p>
          {personal.handle ? (
            <p className="m-0 truncate text-ui text-[var(--fg-muted)]">@{personal.handle}</p>
          ) : null}
          {/* The menu is always the signed-in person, so "Personal" would
              say nothing; a group signed in as itself still says so. */}
          {personal.kind === "group-account" ? (
            <div className="mt-1.5">
              <Badge variant="tag">{identityTag(personal)}</Badge>
            </div>
          ) : null}
        </div>
      </div>
      <Link href={profileHref} {...item} className={row()} onClick={onClose}>
        <UserRound size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
        View profile
      </Link>

      {/* 2. Settings, Help, feedback. Appearance (light, dark, system) is
          in Settings only. */}
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

      {/* 3. Session. "Sign in with another account" asks the PDS who is
          signing in (never the silent bounce back into this account) and
          replaces this session, so it says so. */}
      {separator}
      <button
        type="button"
        {...item}
        className={row()}
        onClick={() => {
          onClose()
          void openSignInAnotherAccount()
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

/** Accessible name for the account button: the visible text first. */
function accountButtonLabel(personal: AccountIdentity): string {
  return `${personal.name}${personal.handle ? `, @${personal.handle}` : ""}, account menu`
}

/**
 * Desktop account button (≥800px): your avatar, name and handle (the text
 * from 1100px), whichever workspace is open: the Workspace button names
 * the group you act as. Opens the account menu in a popover.
 */
export function DesktopAccountMenu() {
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const signOut = useSignOutConfirm(triggerRef)
  const { personal } = useAccountState()

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <button
            ref={triggerRef}
            type="button"
            className="account-button"
            aria-label={accountButtonLabel(personal)}
            data-tour="account-menu"
          >
            <IdentityAvatar identity={personal} size="sm" />
            <span className="account-button__meta" aria-hidden>
              <span className="account-button__name">{personal.name}</span>
              {personal.handle ? (
                <span className="account-button__sub">@{personal.handle}</span>
              ) : null}
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
 * Phone account button (below 800px): your avatar in the top bar,
 * whichever workspace is open. Opens the account menu as a bottom sheet
 * titled "Account".
 */
export function PhoneAccountMenu() {
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const signOut = useSignOutConfirm(triggerRef)
  const { personal } = useAccountState()

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label={accountButtonLabel(personal)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-tour="account-menu"
      >
        <IdentityAvatar identity={personal} size="sm" />
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
