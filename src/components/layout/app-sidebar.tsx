"use client"

import { Suspense, useEffect, useId, useRef, useState, type RefObject } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  CircleHelp,
  FolderOpen,
  Globe,
  LayoutGrid,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { accountSettingsHref, isAccountSettingsPath } from "@/lib/groups/navigation"
import { useOrg } from "@/lib/groups/org-context"
import { useHasPageHeader, useNavbarValues } from "@/lib/navbar-context"
import { hasDesktopChrome } from "@/lib/layout/chrome"
import { useSidebarCollapsed } from "@/lib/layout/sidebar-state"
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
import Tooltip from "@/components/ui/tooltip"
import Wordmark from "@/components/ui/wordmark"
import GlobalSearch from "@/components/search/global-search"
import { DesktopAccountSwitcher } from "./account-switcher"
import { NetworkMenuItems } from "./network-menu"
import { WorkspaceMenuItems } from "./workspace-menu"

const WORKSPACE = DESTINATIONS.find((d) => d.key === "workspace")!
const NETWORK = DESTINATIONS.find((d) => d.key === "network")!

/**
 * The desktop sidebar (≥800px; DESIGN.md §4.1): the app's one banner, on
 * the left, full height.
 *
 *   From 1300px (248px):            800–1299px (an 88px rail):
 *     Certified.app          [⇤]      [mark]
 *     [avatar] Riverbank Trust ⌃⌄     [avatar]
 *     [Search               ⌘K]      Search ▸ (the field, beside it)
 *     WORKSPACE                       Workspace ▸ (a menu of its sections)
 *       Overview, Projects and …      Network ▸ (a menu of its pages)
 *     NETWORK                         Apps
 *       Feed, Explore, Graph, …
 *     ECOSYSTEM
 *       Apps
 *     ─────                           ─────
 *     Help · Settings                 Help · Settings (· Expand)
 *
 * The account control at the top shows who you act as (account-switcher).
 * On the rail each item is an icon over a one-word label (as in the phone
 * pill). From 1300px the sidebar collapses to the rail with the icon at
 * the end of the brand row, and expands again from the rail's last item,
 * Expand. When the list is taller than the window it scrolls, with a
 * fade over its bottom edge.
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
  const { activeOrg } = useOrg()
  // Hydrate with exactly what the server rendered (auth unknown).
  const mounted = useMounted()
  const isLoading = authLoading || !mounted
  const { pageTitle, desktopTitle, breadcrumb } = useNavbarValues()
  const hasPageHeader = useHasPageHeader()
  // Collapse (the brand row) and Expand (the rail's last item) hand focus
  // to each other, since the one you pressed disappears.
  const collapseRef = useRef<HTMLButtonElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  // The list's scroller, for the fade over its bottom edge.
  const [navEl, setNavEl] = useState<HTMLElement | null>(null)
  const moreBelow = useMoreBelow(navEl)

  if (!hasDesktopChrome(pathname)) return null

  const brandHref = !isLoading && !isAuthenticated ? "/welcome" : "/home"

  // Fallback h1 for pages without a <PageHeader> (DESIGN.md §3.6): the
  // record's name on detail pages, else the page title, else the
  // breadcrumb. Visually hidden; the sidebar is display:none on phones,
  // where the top bar's compact title is the h1.
  const breadcrumbText = breadcrumb
    ? [breadcrumb.left.text, breadcrumb.right?.text].filter(Boolean).join(" / ")
    : null
  const fallbackTitle = desktopTitle ?? pageTitle ?? breadcrumbText

  return (
    <header className="app-sidebar">
      {mounted && !hasPageHeader && fallbackTitle ? (
        <h1 className="sr-only">{fallbackTitle}</h1>
      ) : null}
      <div className="app-sidebar__top">
        <div className="app-sidebar__brand-row">
          <Link href={brandHref} className="app-sidebar__brand" aria-label="Certified home">
            <span className="app-sidebar__wordmark">
              <Wordmark variant="certified-app" faded height={18} decorative />
            </span>
            <span className="app-sidebar__brandmark">
              <Brandmark size={28} decorative />
            </span>
          </Link>
          <CollapseButton buttonRef={collapseRef} handoffRef={expandRef} />
        </div>
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
        <SidebarSearch />
      </div>

      <div className="app-sidebar__nav-frame">
        {isLoading ? (
          <div className="app-sidebar__nav" />
        ) : (
          <nav ref={setNavEl} className="app-sidebar__nav" aria-label="Main navigation">
            <FullList isAuthenticated={isAuthenticated} pathname={pathname} />
            <RailList isAuthenticated={isAuthenticated} pathname={pathname} />
          </nav>
        )}
        {/* More rows below the window's edge (a short window): the list
            scrolls, and this says so. */}
        {moreBelow ? <span className="app-sidebar__nav-fade" aria-hidden="true" /> : null}
      </div>

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
              // The settings of the account you act as.
              <SidebarLink
                href={accountSettingsHref(activeOrg)}
                label="Settings"
                icon={Settings}
                current={
                  isDestinationActive({ href: "/settings" }, pathname) ||
                  isAccountSettingsPath(pathname ?? "")
                }
              />
            ) : null}
          </>
        )}
        <ExpandItem buttonRef={expandRef} handoffRef={collapseRef} />
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Collapse and expand
// ---------------------------------------------------------------------------

/*
 * From 1300px the sidebar collapses to its rail (icons over one-word
 * labels, the account control still on top, so who you act as stays in
 * view) and expands again. Remembered in this browser
 * (lib/layout/sidebar-state). Both controls are always rendered and CSS
 * shows the one that applies (the remembered state is on <html> before
 * first paint, so nothing flashes): Collapse at the end of the full
 * sidebar's brand row, Expand as the collapsed rail's last item. Below
 * 1300px, where the sidebar is always the rail, neither shows.
 */

type ToggleProps = {
  buttonRef: RefObject<HTMLButtonElement | null>
  /** The other control: it takes focus when this one disappears. */
  handoffRef: RefObject<HTMLButtonElement | null>
}

/** Pressed from the keyboard: it has focus, and the browser shows it. */
function hasKeyboardFocus(el: HTMLElement | null): boolean {
  if (!el || document.activeElement !== el) return false
  try {
    return el.matches(":focus-visible")
  } catch {
    return true
  }
}

function useToggle(collapse: boolean, { buttonRef, handoffRef }: ToggleProps) {
  const [, setCollapsed] = useSidebarCollapsed()
  return () => {
    // Only a keyboard press moves focus on (a click would pop the other
    // control's tooltip).
    const handoff = hasKeyboardFocus(buttonRef.current)
    // Applies to <html> at once, so the other control is already shown.
    setCollapsed(collapse)
    if (handoff) handoffRef.current?.focus()
  }
}

/** The full sidebar's Collapse: an icon at the end of the brand row. */
function CollapseButton({ buttonRef, handoffRef }: ToggleProps) {
  const collapse = useToggle(true, { buttonRef, handoffRef })
  return (
    <Tooltip label="Collapse" side="right">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon-sm"
        aria-label="Collapse sidebar"
        // Its own tooltip (beside it, like the rail's) replaces the
        // button's default one above it.
        tooltip=""
        className="app-sidebar__collapse"
        onClick={collapse}
      >
        <PanelLeftClose size={18} strokeWidth={1.5} aria-hidden />
      </Button>
    </Tooltip>
  )
}

/** The collapsed rail's Expand (from 1300px): its last item. */
function ExpandItem({ buttonRef, handoffRef }: ToggleProps) {
  const expand = useToggle(false, { buttonRef, handoffRef })
  return (
    <button
      ref={buttonRef}
      type="button"
      className="app-sidebar__item app-sidebar__expand"
      aria-label="Expand sidebar"
      onClick={expand}
    >
      <PanelLeftOpen size={20} strokeWidth={1.5} aria-hidden />
      <span className="app-sidebar__label">Expand</span>
    </button>
  )
}

/**
 * Whether the list has rows below its visible bottom edge (a window too
 * short for it), kept up to date as it scrolls, resizes or changes
 * (sign-in, rail and full).
 */
function useMoreBelow(el: HTMLElement | null): boolean {
  const [more, setMore] = useState(false)
  useEffect(() => {
    if (!el) return
    const measure = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 1)
    measure()
    el.addEventListener("scroll", measure, { passive: true })
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    ro?.observe(el)
    for (const child of Array.from(el.children)) ro?.observe(child)
    return () => {
      el.removeEventListener("scroll", measure)
      ro?.disconnect()
    }
  }, [el])
  return more
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * The global search (activities, projects and accounts across the
 * network), under the account control: the field itself from 1300px, a
 * Search item on the rail that opens the field to the right. `/` and
 * Cmd/Ctrl+K reach it either way (the field handles them where it is on
 * screen; on the rail they open the popover, which focuses the field);
 * the full field shows the shortcut at its end. The tour's
 * `navbar-search` anchor.
 */
function SidebarSearch() {
  const [open, setOpen] = useRouteScopedOpen()
  const railRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"
      const isSlash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
      if (!isModK && !isSlash) return
      // Only on the rail (the item is on screen); the full field handles
      // its own keys.
      if (!railRef.current || railRef.current.getClientRects().length === 0) return
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      setOpen(true)
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [setOpen])

  const shortcut = useSearchShortcut()

  return (
    <>
      <div className="app-sidebar__search" data-tour="navbar-search">
        <GlobalSearch placeholder="Search" />
        {/* The shortcut, quietly at the field's end; CSS hides it once
            the field has text (the clear button takes its place).
            Visual only: the field's own handler takes the keys. */}
        {shortcut ? (
          <kbd className="app-sidebar__search-kbd" aria-hidden="true">
            {shortcut}
          </kbd>
        ) : null}
      </div>
      <Popover open={open} onOpenChange={setOpen} className="app-sidebar__fill app-sidebar__search-rail">
        <PopoverTrigger>
          {/* Opens a field in a group, not a menu: a plain disclosure
              (aria-expanded), with no popup type. */}
          <button
            ref={railRef}
            type="button"
            className="app-sidebar__item"
            aria-haspopup={false}
            data-tour="navbar-search"
          >
            <Search size={20} strokeWidth={1.5} aria-hidden />
            <span className="app-sidebar__label">Search</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          portal
          role="group"
          side="right"
          align="start"
          offset={12}
          minWidth={360}
          aria-label="Search"
          className="w-[400px] p-2"
          style={{ zIndex: "var(--z-chrome-menu)" }}
        >
          <GlobalSearch placeholder="Search" />
        </PopoverContent>
      </Popover>
    </>
  )
}

/** The search shortcut as this platform writes it, once mounted (the
 *  server can't know): "⌘K" on Apple devices, "Ctrl K" elsewhere. */
function useSearchShortcut(): string | null {
  const mounted = useMounted()
  if (!mounted) return null
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K"
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
      {/* Apps gets a heading too, so the three groups read alike: other
          apps that work with the same account. The rail and the phone
          pill have no headings, so it is just "Apps" there. */}
      <SidebarGroup label="Ecosystem">
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
          <RailWorkspaceMenu pathname={pathname} />
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

/** The rail's Workspace: opens a menu of its six sections to the right,
 *  as Network does its pages (the pages have no list of their own). */
function RailWorkspaceMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useRouteScopedOpen()
  const active = isDestinationActive(WORKSPACE, pathname)
  return (
    <Popover open={open} onOpenChange={setOpen} className="app-sidebar__fill">
      <PopoverTrigger>
        <button
          type="button"
          className="app-sidebar__item"
          data-current={active ? "" : undefined}
          aria-current={active ? "true" : undefined}
          data-tour="nav-workspace"
        >
          <FolderOpen size={20} strokeWidth={active ? 2 : 1.5} aria-hidden />
          <span className="app-sidebar__label">Workspace</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        portal
        side="right"
        align="start"
        offset={12}
        minWidth={240}
        aria-label="Workspace"
        style={{ zIndex: "var(--z-chrome-menu)" }}
      >
        <WorkspaceMenuItems onSelect={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
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
