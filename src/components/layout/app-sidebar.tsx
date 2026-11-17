"use client"

import { Suspense, useId } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { CircleHelp, FolderOpen, Globe, LayoutGrid, LogIn, Settings, type LucideIcon } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { hasDesktopChrome } from "@/lib/layout/chrome"
import { DESTINATIONS, isDestinationActive } from "@/lib/layout/destinations"
import {
  WORKSPACE_SECTIONS,
  networkSectionFor,
  networkSectionsFor,
  workspaceSectionFor,
  type WorkspaceSection,
} from "@/lib/layout/nav-items"
import { useMounted } from "@/hooks/use-mounted"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import Brandmark from "@/components/ui/brandmark"
import Button from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import Wordmark from "@/components/ui/wordmark"
import { DesktopAccountSwitcher } from "./account-switcher"
import { NetworkMenuItems } from "./network-menu"

const WORKSPACE = DESTINATIONS.find((d) => d.key === "workspace")!
const NETWORK = DESTINATIONS.find((d) => d.key === "network")!

/**
 * The desktop sidebar (≥800px; DESIGN.md §4.1): the app's one banner, on
 * the left, full height.
 *
 *   From 1300px (248px):            800–1299px (an 88px rail):
 *     Certified.app                   [mark]
 *     [avatar] Riverbank Trust ⌃⌄     [avatar]
 *     WORKSPACE                       Workspace
 *       Overview, Projects and …      Network ▸ (a menu of its pages)
 *     NETWORK                         Apps
 *       Feed, Explore, Graph, …
 *     Apps
 *     ─────                           ─────
 *     Help · Settings                 Help · Settings
 *
 * The account control at the top shows who you act as (account-switcher).
 * On the rail each item is an icon over a one-word label (as in the phone
 * pill); the Workspace's sections stay in the page's own side list there.
 *
 * It always renders on the server and CSS hides it below 800px and
 * switches rail and full list, so the layout never waits for JS; on
 * routes without the app chrome (chrome.ts) it renders nothing, which
 * zeroes `--sidebar-width` (tokens.css). Until sign-in is known it shows
 * the brand and an avatar-sized placeholder and no rows, so nothing is
 * inserted later.
 */
export default function AppSidebar() {
  const pathname = usePathname()
  const { isLoading: authLoading, isAuthenticated, openSignIn } = useAuth()
  // Hydrate with exactly what the server rendered (auth unknown).
  const mounted = useMounted()
  const isLoading = authLoading || !mounted

  if (!hasDesktopChrome(pathname)) return null

  const brandHref = !isLoading && !isAuthenticated ? "/welcome" : "/home"

  return (
    <header className="app-sidebar">
      <div className="app-sidebar__top">
        <Link href={brandHref} className="app-sidebar__brand" aria-label="Certified home">
          <span className="app-sidebar__wordmark">
            <Wordmark variant="certified-app" faded height={18} decorative />
          </span>
          <span className="app-sidebar__brandmark">
            <Brandmark size={28} decorative />
          </span>
        </Link>
        {/* The account slot keeps one height whatever fills it, so the
            rows below never move. */}
        <div className="app-sidebar__account-slot">
          {isLoading ? (
            <span className="app-sidebar__account-placeholder" aria-hidden />
          ) : isAuthenticated ? (
            <DesktopAccountSwitcher />
          ) : (
            // Signed out, the account slot is how you become someone: a
            // rail item (icon over "Sign in") on the rail, the primary
            // button from 1300px.
            <>
              <button
                type="button"
                className="app-sidebar__item app-sidebar__sign-in--rail"
                onClick={openSignIn}
              >
                <LogIn size={20} strokeWidth={1.5} aria-hidden />
                <span className="app-sidebar__label">Sign in</span>
              </button>
              <Button
                variant="primary"
                size="md"
                onClick={openSignIn}
                className="app-sidebar__sign-in--full"
              >
                Sign in
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="app-sidebar__nav" />
      ) : (
        <nav className="app-sidebar__nav" aria-label="Main navigation">
          <FullList isAuthenticated={isAuthenticated} pathname={pathname} />
          <RailList isAuthenticated={isAuthenticated} pathname={pathname} />
        </nav>
      )}

      {/* Filled once sign-in is known (anchored at the bottom, so nothing
          above it moves). */}
      <div className="app-sidebar__bottom">
        {isLoading ? null : (
          <>
            <SidebarLink
              href="/help"
              label="Help"
              icon={CircleHelp}
              current={isDestinationActive({ href: "/help" }, pathname)}
            />
            {isAuthenticated ? (
              <SidebarLink
                href="/settings"
                label="Settings"
                icon={Settings}
                current={isDestinationActive({ href: "/settings" }, pathname)}
              />
            ) : null}
          </>
        )}
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * One row: an icon and its label, beside each other in the full sidebar
 * and stacked (icon over a one-word label) on the rail. `aria-current`
 * marks the page you're on.
 */
function SidebarLink({
  href,
  label,
  icon: Icon,
  current,
  tour,
}: {
  href: string
  label: string
  icon: LucideIcon
  current: boolean
  tour?: string
}) {
  return (
    <Link
      href={href}
      className="app-sidebar__item"
      aria-current={current ? "page" : undefined}
      data-tour={tour}
    >
      <Icon size={20} strokeWidth={current ? 2 : 1.5} aria-hidden />
      <span className="app-sidebar__label">{label}</span>
    </Link>
  )
}

/** A labelled group of rows (full sidebar). */
function SidebarGroup({
  label,
  tour,
  children,
}: {
  label?: string
  tour?: string
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <div className="app-sidebar__group" data-tour={tour}>
      {label ? (
        <p id={id} className="app-sidebar__group-label">
          {label}
        </p>
      ) : null}
      <ul className="app-sidebar__list" aria-labelledby={label ? id : undefined}>
        {children}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// From 1300px: every page
// ---------------------------------------------------------------------------

function FullList({ isAuthenticated, pathname }: { isAuthenticated: boolean; pathname: string }) {
  const network = networkSectionFor(pathname)
  return (
    <div className="app-sidebar__full">
      {isAuthenticated ? (
        <SidebarGroup label="Workspace" tour="nav-workspace">
          {/* `?kind=` marks the Records section: read in its own boundary,
              so the sidebar never waits on search params. */}
          <Suspense fallback={<WorkspaceItems current={null} />}>
            <CurrentWorkspaceItems pathname={pathname} />
          </Suspense>
        </SidebarGroup>
      ) : null}
      <SidebarGroup label="Network" tour="nav-network">
        {networkSectionsFor(isAuthenticated).map((s) => (
          <li key={s.key}>
            <SidebarLink href={s.href} label={s.label} icon={s.icon} current={s.key === network} />
          </li>
        ))}
      </SidebarGroup>
      <SidebarGroup>
        <li>
          <SidebarLink
            href="/apps"
            label="Apps"
            icon={LayoutGrid}
            current={isDestinationActive({ href: "/apps" }, pathname)}
            tour="nav-apps"
          />
        </li>
      </SidebarGroup>
    </div>
  )
}

function CurrentWorkspaceItems({ pathname }: { pathname: string }) {
  const kind = useSearchParams()?.get("kind") ?? null
  return <WorkspaceItems current={workspaceSectionFor(pathname, kind)} />
}

function WorkspaceItems({ current }: { current: WorkspaceSection | null }) {
  return (
    <>
      {WORKSPACE_SECTIONS.map((s) => (
        <li key={s.key}>
          <SidebarLink href={s.href} label={s.label} icon={s.icon} current={s.key === current} />
        </li>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// 800–1299px: the rail
// ---------------------------------------------------------------------------

function RailList({ isAuthenticated, pathname }: { isAuthenticated: boolean; pathname: string }) {
  return (
    <ul className="app-sidebar__rail">
      {isAuthenticated ? (
        <li>
          <SidebarLink
            href={WORKSPACE.href}
            label="Workspace"
            icon={FolderOpen}
            current={isDestinationActive(WORKSPACE, pathname)}
            tour="nav-workspace"
          />
        </li>
      ) : null}
      <li>
        <RailNetworkMenu isAuthenticated={isAuthenticated} pathname={pathname} />
      </li>
      <li>
        <SidebarLink
          href="/apps"
          label="Apps"
          icon={LayoutGrid}
          current={isDestinationActive({ href: "/apps" }, pathname)}
          tour="nav-apps"
        />
      </li>
    </ul>
  )
}

/** The rail's Network: opens a menu of its five pages to the right. */
function RailNetworkMenu({ isAuthenticated, pathname }: { isAuthenticated: boolean; pathname: string }) {
  const [open, setOpen] = useRouteScopedOpen()
  const current = networkSectionFor(pathname)
  const active = isDestinationActive(NETWORK, pathname)
  return (
    <Popover open={open} onOpenChange={setOpen} className="app-sidebar__fill">
      <PopoverTrigger>
        <button
          type="button"
          className="app-sidebar__item"
          data-current={active ? "" : undefined}
          aria-current={active ? "true" : undefined}
          data-tour="nav-network"
        >
          <Globe size={20} strokeWidth={current ? 2 : 1.5} aria-hidden />
          <span className="app-sidebar__label">Network</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        portal
        side="right"
        align="start"
        offset={12}
        minWidth={200}
        aria-label="Network"
        style={{ zIndex: "var(--z-chrome-menu)" }}
      >
        <NetworkMenuItems
          mode="menu"
          isAuthenticated={isAuthenticated}
          current={current}
          onSelect={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
