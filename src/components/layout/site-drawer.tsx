"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Home, Settings, User, X } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"

/**
 * GitHub-style site-nav drawer.
 *
 * Slides in from the left when the hamburger button in the top bar
 * is clicked. Mirrors GitHub's "global navigation" pattern — a
 * wordmark at the top-left, an X close button at the top-right, and
 * a vertical list of primary destinations below.
 *
 * Closing behavior: explicit X, click on the dimmed overlay, or the
 * Escape key. Body scroll is locked while open.
 */
export default function SiteDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const pathname = usePathname()
  const { isAuthenticated } = useAuth()
  const { handle } = useSession()

  // Lock body scroll + bind Escape while open.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  // Profile target: own profile when signed in, sign-in prompt otherwise.
  const profileHref =
    isAuthenticated && handle
      ? `/profile/${encodeURIComponent(handle)}`
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
    <>
      <div
        className={`site-drawer__scrim${open ? " site-drawer__scrim--open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`site-drawer${open ? " site-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        aria-hidden={!open}
      >
        <header className="site-drawer__head">
          <Link
            href="/home"
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
      </aside>
    </>
  )
}
