"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Home, LayoutGrid, Settings, User, X } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import Drawer from "@/components/ui/drawer"

/**
 * GitHub-style site-nav drawer.
 *
 * Slides in from the left when the hamburger button in the top bar
 * is clicked. Mirrors GitHub's "global navigation" pattern — a
 * wordmark at the top-left, an X close button at the top-right, and
 * a vertical list of primary destinations below.
 *
 * Composes the canonical <Drawer> primitive for the portal shell,
 * backdrop scrim, focus trap, body-scroll lock, Esc-to-close and the
 * slide animation. This component owns only the drawer's inner
 * content (head + nav).
 */
export default function SiteDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const pathname = usePathname()
  const { isLoading, isAuthenticated } = useAuth()
  const { handle: personalHandle } = useSession()
  const { activeOrg } = useOrg()
  // The "My profile" item — and any future identity-bound link added
  // to this drawer — must route to the account the user is currently
  // *acting as*, not their personal identity. When the account
  // switcher is on a group, that's the group's handle; otherwise it
  // falls back to the personal handle. Matches the convention the
  // desktop top bar and the mobile sidebar already use.
  const activeHandle = activeOrg?.handle ?? personalHandle

  // Profile target: active identity's profile when signed in (group's
  // when acting as a group, personal otherwise); sign-in prompt
  // otherwise. The label stays "My profile" — "my" follows the
  // currently active identity by design, same as everywhere else
  // in the chrome.
  const profileHref =
    isAuthenticated && activeHandle
      ? `/profile/${encodeURIComponent(activeHandle)}`
      : null

  const items: {
    key: string
    label: string
    href: string | null
    icon: typeof Home
    requiresAuth?: boolean
  }[] = [
    { key: "home", label: "Home", href: "/home", icon: Home },
    { key: "explore", label: "Explore", href: "/explore", icon: Compass },
    { key: "apps", label: "Apps", href: "/apps", icon: LayoutGrid },
    {
      key: "profile",
      label: "My profile",
      href: profileHref,
      icon: User,
      requiresAuth: true,
    },
    { key: "settings", label: "Settings", href: "/settings", icon: Settings },
  ]

  return (
    <Drawer open={open} onClose={onClose} side="left" ariaLabel="Site navigation">
        <header className="site-drawer__head">
          <Link
            href={!isLoading && !isAuthenticated ? "/welcome" : "/home"}
            className="site-drawer__brand"
            onClick={onClose}
            aria-label="Certified home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/wordmark/certified_wordmark_black.svg"
              alt="Certified"
              className="site-drawer__wordmark"
            />
          </Link>
          <button
            type="button"
            className="site-drawer__close"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>

        <nav className="site-drawer__nav" aria-label="Primary">
          {items.map((item) => {
            const Icon = item.icon
            const isActive =
              item.href !== null &&
              (item.href === pathname ||
                (item.href !== "/" && pathname?.startsWith(item.href)))
            const disabled = item.requiresAuth && !isAuthenticated
            if (disabled || !item.href) {
              return (
                <button
                  key={item.key}
                  type="button"
                  className="site-drawer__item site-drawer__item--disabled"
                  disabled
                  title="Sign in to access your profile"
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                  {item.label}
                </button>
              )
            }
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`site-drawer__item${isActive ? " site-drawer__item--active" : ""}`}
                onClick={onClose}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                {item.label}
              </Link>
            )
          })}
        </nav>
    </Drawer>
  )
}
