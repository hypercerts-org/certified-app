"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { AtSign, KeyRound, Mail, Palette, Share2 } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import OrgSettings from "@/components/groups/org-settings"
import SyncSocialGraphSection from "@/components/settings/sync-social-graph-section"
import ThemeToggle from "@/components/ui/theme-toggle"

const UsernameCard = dynamic(
  () => import("@/components/dashboard/username-card"),
)
const EmailSection = dynamic(
  () => import("@/components/account/email-section"),
)
const PasswordSection = dynamic(
  () => import("@/components/account/password-section"),
)

type CategoryKey =
  | "username"
  | "email"
  | "password"
  | "appearance"
  | "social-graph"

type CategoryDef = {
  key: CategoryKey
  label: string
  description: string
  Icon: typeof AtSign
}

const CATEGORIES: CategoryDef[] = [
  {
    key: "appearance",
    label: "Appearance",
    description: "Light or dark theme — or match your system preference.",
    Icon: Palette,
  },
  {
    key: "social-graph",
    label: "Sync social graph",
    description:
      "Compare your Certified follows with your Bluesky follows and import any that are missing.",
    Icon: Share2,
  },
  {
    key: "username",
    label: "Username",
    description: "The @handle people use to find you on Certified.",
    Icon: AtSign,
  },
  {
    key: "email",
    label: "Email",
    description: "Used to sign in and recover your account.",
    Icon: Mail,
  },
  {
    key: "password",
    label: "Password",
    description: "Reset the password used to sign in to this account.",
    Icon: KeyRound,
  },
]

const DEFAULT_CATEGORY: CategoryKey = CATEGORIES[0].key

function readHashCategory(): CategoryKey | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.replace(/^#/, "").toLowerCase()
  const match = CATEGORIES.find((c) => c.key === raw)
  return match ? match.key : null
}

/**
 * Shared settings two-pane layout. Renders on both `/settings` and the
 * profile-page `?tab=settings` panel. Scroll-spy + deep-link behavior
 * is identical in both contexts.
 */
export default function SettingsPanel() {
  const { did, pdsUrl } = useAuth()
  const { handle, email } = useSession()
  const { activeOrg } = useOrg()

  const [active, setActive] = useState<CategoryKey>(DEFAULT_CATEGORY)
  const sectionRefs = useRef<Map<CategoryKey, HTMLElement>>(new Map())

  useEffect(() => {
    const initial = readHashCategory()
    if (initial) {
      setActive(initial)
      requestAnimationFrame(() => {
        const el = sectionRefs.current.get(initial)
        if (el) el.scrollIntoView({ block: "start", behavior: "auto" })
      })
    }
  }, [])

  useEffect(() => {
    const els = Array.from(sectionRefs.current.entries())
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      () => {
        let best: { key: CategoryKey; top: number } | null = null
        for (const [key, el] of sectionRefs.current.entries()) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 120) {
            if (!best || rect.top > best.top) {
              best = { key, top: rect.top }
            }
          }
        }
        if (best) setActive(best.key)
        else setActive(CATEGORIES[0].key)
      },
      {
        rootMargin: "-15% 0px -60% 0px",
        threshold: [0, 0.1, 0.5, 1],
      },
    )

    for (const [, el] of els) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const onMenuClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, key: CategoryKey) => {
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return
      }
      e.preventDefault()
      const el = sectionRefs.current.get(key)
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "smooth" })
        el.classList.remove("sx-section--flash")
        void el.offsetWidth
        el.classList.add("sx-section--flash")
        window.setTimeout(() => el.classList.remove("sx-section--flash"), 1500)
      }
      if (typeof window !== "undefined") {
        const next = `#${key}`
        if (window.location.hash !== next) {
          window.history.replaceState(null, "", next)
        }
      }
      setActive(key)
    },
    [],
  )

  const setSectionRef = useCallback(
    (key: CategoryKey) => (el: HTMLElement | null) => {
      if (el) sectionRefs.current.set(key, el)
      else sectionRefs.current.delete(key)
    },
    [],
  )

  if (activeOrg) {
    return <OrgSettings groupDid={activeOrg.groupDid} org={activeOrg} />
  }

  return (
    <div className="sx sx--wide">
      <h1 className="sx__heading sr-only">Settings</h1>

      <div className="sx__layout">
        <aside className="sx__menu">
          <nav aria-label="Settings sections">
            <ul className="sx-menu">
              {CATEGORIES.map((cat) => {
                const isActive = cat.key === active
                const Icon = cat.Icon
                return (
                  <li key={cat.key}>
                    <a
                      href={`#${cat.key}`}
                      aria-current={isActive ? "true" : undefined}
                      className={`sx-menu__item${isActive ? " sx-menu__item--active" : ""}`}
                      onClick={(e) => onMenuClick(e, cat.key)}
                    >
                      <span className="sx-menu__icon" aria-hidden>
                        <Icon size={16} strokeWidth={1.75} />
                      </span>
                      <span className="sx-menu__label">{cat.label}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
        </aside>

        <div className="sx__panel">
          {CATEGORIES.map((cat) => (
            <section
              key={cat.key}
              id={cat.key}
              ref={setSectionRef(cat.key)}
              className="sx-section"
              aria-labelledby={`sx-section-${cat.key}-title`}
            >
              <header className="sx-panel__header">
                <h2
                  id={`sx-section-${cat.key}-title`}
                  className="sx-panel__title"
                >
                  {cat.label}
                </h2>
                <p className="sx-panel__desc">{cat.description}</p>
              </header>

              <div className="sx-panel__body">
                {cat.key === "username" && (
                  <UsernameCard
                    handle={handle}
                    pdsUrl={pdsUrl || undefined}
                    did={did || undefined}
                  />
                )}
                {cat.key === "email" && (
                  <EmailSection email={email || ""} />
                )}
                {cat.key === "password" && (
                  <PasswordSection email={email || ""} />
                )}
                {cat.key === "appearance" && <ThemeToggle />}
                {cat.key === "social-graph" && did ? (
                  <SyncSocialGraphSection did={did} ownDid={did} />
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
