"use client"

import { useId, useRef, useState, type RefObject } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronsUpDown,
  CircleHelp,
  LogIn,
  LogOut,
  MessageSquare,
  Plus,
  Settings,
  UserRound,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useFeedback } from "@/lib/feedback-context"
import { accountSettingsHref } from "@/lib/groups/navigation"
import { useOrg } from "@/lib/groups/org-context"
import type { Group } from "@/lib/groups/types"
import { isFormRoute } from "@/lib/layout/bottom-nav-visibility"
import { useSidebarIsFull } from "@/lib/layout/sidebar-state"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import Badge from "@/components/ui/badge"
import BottomSheet from "@/components/ui/bottom-sheet"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import Tooltip from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/toast"
import { IdentityAvatar, identityTag, useAccountState, type AccountIdentity } from "./account-menu"
import {
  MENU_ICON_CLASS,
  MENU_SEPARATOR_CLASS,
  menuItemProps,
  menuRowClass,
  type MenuMode,
} from "./menu-row"
import { groupIdentity, useOpenWorkspace, useWorkspaceState, WorkspaceRow } from "./workspace-menu"

/**
 * The one account control (DESIGN.md §4.4): it shows the account you act
 * as, and its menu holds both "Act as" (you and your groups) and "Signed
 * in as" (your profile and settings, another sign-in, sign out). Desktop:
 * the top of the sidebar. Phones: the right end of the top bar.
 */

// ---------------------------------------------------------------------------
// The mark: who you act as
// ---------------------------------------------------------------------------

/**
 * The acting account's avatar. As a group, the group's square avatar with
 * your round one on its corner, so the one mark says both who is signed
 * in and who the app acts as.
 */
export function ActingAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const { current, personal } = useAccountState()
  return (
    <span className="acting-avatar" data-size={size}>
      <IdentityAvatar identity={current} size={size} />
      {current.kind === "group" ? (
        <span className="acting-avatar__you" aria-hidden>
          {/* One initial: two don't read at 16px. */}
          <IdentityAvatar identity={{ ...personal, initials: personal.initials.slice(0, 1) }} size="2xs" />
        </span>
      ) : null}
    </span>
  )
}

/** The control's accessible name: the visible name first. */
export function accountControlLabel(current: AccountIdentity, personal: AccountIdentity): string {
  if (current.kind === "group") {
    return `${current.name}, group, signed in as ${personal.name}, account menu`
  }
  return `${personal.name}${personal.handle ? `, @${personal.handle}` : ""}, account menu`
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
  // returns to the account control instead.
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

/** The id of the "Now acting as" toast, so a switch replaces the last one. */
export const ACTING_AS_TOAST_ID = "acting-as"

export interface AccountMenuContentProps {
  mode: MenuMode
  /** Close the popover / sheet (called before every action). */
  onClose: () => void
  /** Ask for the sign-out confirmation. */
  onRequestSignOut: () => void
}

/**
 * 1. **Act as** (only with something to switch to): you first, then each
 *    of your groups, each with a gear to its settings (yours too), then
 *    New group.
 *    Picking one switches who you act as (`useOpenWorkspace`) and says so
 *    in a toast. On a create or edit form the rows stay visible but
 *    inert, so switching can't drop a draft. With nothing to switch, the
 *    block is your identity instead.
 * 2. **Signed in as** you: View profile (and Settings, when there is no
 *    "Act as" and so no gear), Sign in with another account, Send
 *    feedback (desktop only; the sheet has it in block 3), Sign out.
 * 3. On phones only (the sheet), where there is no sidebar: Help, Send
 *    feedback and the legal links. The desktop has Help at the bottom of
 *    the sidebar and the legal links in the site footer.
 *
 * One component for both presentations: inside `<PopoverContent>`
 * (role="menu") on desktop and inside a `<BottomSheet>` on phones.
 */
export function AccountMenuContent({ mode, onClose, onRequestSignOut }: AccountMenuContentProps) {
  const { openSignInAnotherAccount } = useAuth()
  const { openFeedback } = useFeedback()
  const { personal, groups, activeOrg, canSwitch } = useWorkspaceState()
  const { profileHref } = useAccountState()
  const openWorkspace = useOpenWorkspace()
  const { switchOrg } = useOrg()
  const { toast } = useToast()
  const onForm = isFormRoute(usePathname())
  const actId = useId()
  const youId = useId()
  const isMenu = mode === "menu"
  const Heading = isMenu ? "p" : "h3"
  const headingClass = "m-0 px-3 pb-1 pt-2 text-label text-[var(--fg-muted)]"
  const item = menuItemProps(mode)
  const row = (extra?: string) => menuRowClass(mode, extra)
  const separator = isMenu ? (
    <div role="separator" className={MENU_SEPARATOR_CLASS} />
  ) : (
    <hr className={MENU_SEPARATOR_CLASS} />
  )

  // One "Now acting as" toast at a time: a later switch replaces the
  // earlier one (a fixed id) rather than stacking under it.
  const sayActingAs = (next: Group | null) => {
    toast({
      id: ACTING_AS_TOAST_ID,
      title: `Now acting as ${next ? groupIdentity(next).name : personal.name}`,
    })
  }

  const select = (next: Group | null) => {
    onClose()
    const isCurrent = next ? activeOrg?.groupDid === next.groupDid : !activeOrg
    openWorkspace(next)
    if (!isCurrent) sayActingAs(next)
  }

  // A gear opens that account's settings as that account (its link does
  // the navigating), so Settings always belong to the account the control
  // shows.
  const openSettings = (next: Group | null) => {
    onClose()
    const isCurrent = next ? activeOrg?.groupDid === next.groupDid : !activeOrg
    if (!isCurrent) {
      switchOrg(next)
      sayActingAs(next)
    }
  }

  return (
    <div className="flex flex-col">
      {canSwitch ? (
        <div role={isMenu ? "group" : undefined} aria-labelledby={actId} className="flex flex-col">
          <Heading id={actId} className={headingClass}>
            Act as
          </Heading>
          {/* Every account's settings behind the same gear, yours too;
              opening them acts as that account. */}
          <WorkspaceRow
            mode={mode}
            identity={personal}
            note="You"
            current={!activeOrg}
            disabled={onForm}
            onSelect={() => select(null)}
            settings={{
              href: accountSettingsHref(null),
              label: "Your settings",
              onNavigate: () => openSettings(null),
            }}
          />
          {groups.map((group) => {
            const identity = groupIdentity(group)
            return (
              <WorkspaceRow
                key={group.groupDid}
                mode={mode}
                identity={identity}
                current={activeOrg?.groupDid === group.groupDid}
                disabled={onForm}
                onSelect={() => select(group)}
                settings={{
                  href: accountSettingsHref(group),
                  label: `${identity.name} settings`,
                  onNavigate: () => openSettings(group),
                }}
              />
            )
          })}
          {onForm ? (
            <p className="m-0 px-3 pb-1 pt-1 text-caption text-[var(--fg-muted)]">
              Finish or cancel this form to switch.
            </p>
          ) : null}
          <Link href="/groups/create" {...item} className={row()} onClick={onClose}>
            <Plus size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
            New group
          </Link>
        </div>
      ) : (
        // Nothing to switch: the block is you. Presentational inside the
        // menu (the trigger's label already names you).
        <div className="flex items-start gap-3 px-3 pb-2 pt-2" role={isMenu ? "none" : undefined}>
          <IdentityAvatar identity={personal} size="md" />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate font-headline text-h4 text-[var(--fg-primary)]">{personal.name}</p>
            {personal.handle ? (
              <p className="m-0 truncate text-ui text-[var(--fg-muted)]">@{personal.handle}</p>
            ) : null}
            {personal.kind === "group-account" ? (
              <div className="mt-1.5">
                <Badge variant="tag">{identityTag(personal)}</Badge>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {separator}
      <div
        role={isMenu ? "group" : undefined}
        aria-labelledby={canSwitch ? youId : undefined}
        aria-label={canSwitch ? undefined : "You"}
        className="flex flex-col"
      >
        {canSwitch ? (
          <Heading id={youId} className={`${headingClass} truncate`}>
            Signed in as{" "}
            <span className="normal-case tracking-normal">{personal.name}</span>
          </Heading>
        ) : null}
        <Link href={profileHref} {...item} className={row()} onClick={onClose}>
          <UserRound size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
          View profile
        </Link>
        {/* With "Act as", your settings are your row's gear; without it
            (nothing to switch), they are a row here. */}
        {canSwitch ? null : (
          <Link href="/settings" {...item} className={row()} onClick={onClose}>
            <Settings size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
            Settings
          </Link>
        )}
        {/* "Sign in with another account" asks the PDS who is signing in
            (never the silent bounce back into this account) and replaces
            this session, so it says so. */}
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
        {/* Desktop: feedback is otherwise only in the footer and on /help.
            The phone sheet has it in its own block below. */}
        {isMenu ? (
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
        ) : null}
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
      </div>

      {/* Phones: the app's own help and fine print, one tap from the
          avatar (the desktop keeps them in the sidebar and the footer). */}
      {!isMenu ? (
        <>
          {separator}
          <Link href="/help" className={row()} onClick={onClose}>
            <CircleHelp size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
            Help
          </Link>
          <button
            type="button"
            className={row()}
            onClick={() => {
              onClose()
              openFeedback()
            }}
          >
            <MessageSquare size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
            Send feedback
          </button>
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
                // 44px both ways: the words are short ("Terms").
                className="inline-flex min-h-control-md min-w-11 items-center text-[var(--fg-muted)] no-underline hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
              >
                {label}
              </Link>
            ))}
          </nav>
        </>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/**
 * The sidebar's account control (≥800px). From 1300px: the acting
 * account's avatar, name and a second line (@handle, or "Group · Admin"),
 * with a chevron; the menu opens below. On the 800–1299px rail: the avatar
 * alone, with its name in a tooltip on hover, and the menu opens to the
 * right. The product tour's `account-menu` anchor.
 */
export function DesktopAccountSwitcher() {
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const signOut = useSignOutConfirm(triggerRef)
  const { current, personal } = useAccountState()
  // The full sidebar (from 1300px, unless collapsed to the rail).
  const isFullDesktop = useSidebarIsFull()
  const sub =
    current.kind === "personal" && current.handle ? `@${current.handle}` : identityTag(current)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen} className="app-sidebar__fill">
        {/* The tooltip names the account on the rail, where only the
            avatar shows; suppressed (not removed, so the trigger keeps
            its focus) while the menu is open and from 1300px, where the
            name is on screen. */}
        <Tooltip
          label={current.name}
          side="right"
          suppressed={open || isFullDesktop}
          className="app-sidebar__fill"
        >
          <span className="app-sidebar__account-wrap">
            <PopoverTrigger>
              <button
                ref={triggerRef}
                type="button"
                className="app-sidebar__account"
                aria-label={accountControlLabel(current, personal)}
                data-tour="account-menu"
              >
                <ActingAvatar size="sm" />
                <span className="app-sidebar__account-meta" aria-hidden>
                  <span className="app-sidebar__account-name">{current.name}</span>
                  <span className="app-sidebar__account-sub">{sub}</span>
                </span>
                <ChevronsUpDown
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden
                  className="app-sidebar__account-chevron"
                />
              </button>
            </PopoverTrigger>
          </span>
        </Tooltip>
        <PopoverContent
          portal
          side={isFullDesktop ? "bottom" : "right"}
          align="start"
          offset={isFullDesktop ? 8 : 12}
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
 * The phone top bar's account control (below 800px): the acting
 * account's avatar at the right end, on every page. Opens the same menu
 * as a bottom sheet titled "Account". The tour's `account-menu` anchor on
 * phones.
 */
export function PhoneAccountSwitcher() {
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
        aria-label={accountControlLabel(current, personal)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-tour="account-menu"
      >
        <ActingAvatar size="sm" />
      </Button>
      {/* Tall: the whole menu (Act as, Signed in as, Help, the legal
          links) shows when it fits, rather than a 70vh peek of it. */}
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Account"
        returnFocusRef={triggerRef}
        tall
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
