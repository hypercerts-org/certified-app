"use client"

import React, { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import {
  AtSign,
  ChevronLeft,
  ChevronRight,
  Key,
  KeyRound,
  Mail,
  Palette,
  Share2,
  Users,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import OrgSettings from "@/components/groups/org-settings"
import SyncSocialGraphSection from "@/components/settings/sync-social-graph-section"
import ImportAsGroupSection from "@/components/settings/import-as-group-section"
import AppPasswordsSection from "@/components/settings/app-passwords-section"
import ThemeToggle from "@/components/ui/theme-toggle"
import SettingRow from "@/components/ui/setting-row"

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
  | "app-passwords"
  | "group"

type CategoryDef = {
  key: CategoryKey
  /** Panel heading — the full, descriptive title. */
  label: string
  /** Shorter label for the nav rail / mobile list. Defaults to `label`. */
  navLabel?: string
  description: string
  Icon: typeof AtSign
}

type CategoryGroup = { label: string; items: CategoryDef[] }

/**
 * Settings are organised into a grouped left-rail of categories; selecting
 * one shows ONLY that category's panel (no long scroll). New settings slot
 * into an existing group — or a new group — without changing the layout, so
 * the surface scales as more are added. On mobile the rail is the first
 * screen (a master list); tapping a row drills into its panel with a back
 * control. Both views render the same DOM; `data-view` + CSS pick which is
 * visible, so there's no desktop hydration flash.
 */
const GROUPS: CategoryGroup[] = [
  {
    label: "Account",
    items: [
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
        description: "The password used to sign in to other AT Protocol apps.",
        Icon: KeyRound,
      },
    ],
  },
  {
    label: "Preferences",
    items: [
      {
        key: "appearance",
        label: "Appearance",
        description: "Set how Certified looks on this device.",
        Icon: Palette,
      },
      {
        key: "social-graph",
        label: "Sync social graph",
        navLabel: "Social graph",
        description:
          "Compare your Certified follows with your Bluesky follows and import any that are missing.",
        Icon: Share2,
      },
    ],
  },
  {
    label: "Advanced",
    items: [
      {
        key: "app-passwords",
        label: "App passwords",
        description:
          "Create passwords for other apps (and the group import). Shown once — revoke anytime.",
        Icon: Key,
      },
      {
        key: "group",
        label: "Promote this account to a group account",
        navLabel: "Group account",
        description:
          "Turn this personal account into a shared group that several people can manage.",
        Icon: Users,
      },
    ],
  },
]

const ALL_CATEGORIES = GROUPS.flatMap((g) => g.items)
const DEFAULT_CATEGORY: CategoryKey = ALL_CATEGORIES[0].key

function readHashCategory(): CategoryKey | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.replace(/^#/, "").toLowerCase()
  const match = ALL_CATEGORIES.find((c) => c.key === raw)
  return match ? match.key : null
}

/**
 * Shared settings two-pane layout. Renders on both `/settings` and the
 * profile-page `?tab=settings` panel.
 */
export default function SettingsPanel() {
  const { did, pdsUrl } = useAuth()
  const { handle, email } = useSession()
  const { activeOrg } = useOrg()

  // `null` = no category actively selected. On desktop that resolves to the
  // first category (a panel is always shown); on mobile it means the master
  // list is showing. Driven by the `#<key>` hash so deep links + back/forward
  // work.
  const [active, setActive] = useState<CategoryKey | null>(null)

  useEffect(() => {
    const sync = () => setActive(readHashCategory())
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  const select = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, key: CategoryKey) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return
      }
      e.preventDefault()
      setActive(key)
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${key}`)
        window.scrollTo({ top: 0 })
      }
    },
    [],
  )

  const back = useCallback(() => {
    setActive(null)
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      )
      window.scrollTo({ top: 0 })
    }
  }, [])

  if (activeOrg) {
    return <OrgSettings groupDid={activeOrg.groupDid} org={activeOrg} />
  }

  // The category whose panel renders on the right. On the mobile master list
  // (active === null) the panel is hidden, so the resolved default is moot.
  const selectedKey: CategoryKey = active ?? DEFAULT_CATEGORY
  const selected =
    ALL_CATEGORIES.find((c) => c.key === selectedKey) ?? ALL_CATEGORIES[0]

  const renderNavItem = (cat: CategoryDef) => {
    const isActive = cat.key === selectedKey
    const Icon = cat.Icon
    return (
      <li key={cat.key}>
        <a
          href={`#${cat.key}`}
          aria-current={isActive ? "true" : undefined}
          className={`sx-menu__item${isActive ? " sx-menu__item--active" : ""}`}
          onClick={(e) => select(e, cat.key)}
        >
          <span className="sx-menu__icon" aria-hidden>
            <Icon size={16} strokeWidth={1.75} />
          </span>
          <span className="sx-menu__label">{cat.navLabel ?? cat.label}</span>
          <ChevronRight className="sx-menu__chevron" size={16} aria-hidden />
        </a>
      </li>
    )
  }

  const renderBody = (key: CategoryKey) => {
    switch (key) {
      case "username":
        return (
          <UsernameCard
            handle={handle}
            pdsUrl={pdsUrl || undefined}
            did={did || undefined}
          />
        )
      case "email":
        return <EmailSection email={email || ""} />
      case "password":
        return <PasswordSection email={email || ""} />
      case "appearance":
        return (
          <SettingRow title="Theme">
            <ThemeToggle compact />
          </SettingRow>
        )
      case "social-graph":
        return did ? <SyncSocialGraphSection did={did} ownDid={did} /> : null
      case "app-passwords":
        return <AppPasswordsSection />
      case "group":
        return did ? <ImportAsGroupSection did={did} /> : null
    }
  }

  return (
    <div className="sx" data-view={active ? "detail" : "list"}>
      <h1 className="sx__heading sr-only">Settings</h1>

      <div className="page-layout">
        <aside className="sx__menu">
          <nav aria-label="Settings sections">
            {GROUPS.map((group) => (
              <div className="sx-nav-group" key={group.label}>
                <p className="sx-nav-group__label">{group.label}</p>
                <ul className="sx-menu">{group.items.map(renderNavItem)}</ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="page-layout__main sx__panel">
          <button type="button" className="sx-back" onClick={back}>
            <ChevronLeft size={16} aria-hidden />
            Settings
          </button>
          <section className="sx-section" aria-labelledby="sx-section-title">
            <header className="sx-panel__header">
              <h2 id="sx-section-title" className="sx-panel__title">
                {selected.label}
              </h2>
              {selected.description ? (
                <p className="sx-panel__desc">{selected.description}</p>
              ) : null}
            </header>
            <div className="sx-panel__body">{renderBody(selectedKey)}</div>
          </section>
        </div>
      </div>
    </div>
  )
}
