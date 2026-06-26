"use client"

import React, { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import {
  ChevronLeft,
  ChevronRight,
  CircleUser,
  Key,
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

type PageKey =
  | "account"
  | "appearance"
  | "social-graph"
  | "app-passwords"
  | "group"

type SectionKey =
  | "username"
  | "email"
  | "password"
  | "theme"
  | "social-graph"
  | "app-passwords"
  | "group"

/** A control within a page. Pages with more than one section render each
 *  under its own sub-heading; single-section pages render the body directly
 *  under the page header. */
type SectionDef = {
  key: SectionKey
  title?: string
  description?: string
}

type PageDef = {
  key: PageKey
  /** Panel heading. */
  label: string
  /** Shorter label for the rail / mobile list. Defaults to `label`. */
  navLabel?: string
  description: string
  Icon: typeof CircleUser
  sections: SectionDef[]
}

type PageGroup = { label: string; items: PageDef[] }

/**
 * Settings are organised into a grouped rail of pages; selecting one shows
 * only that page (no long scroll). Each page bundles its related controls,
 * so we never strand a single field on its own screen — the small account
 * controls share one "Account" page, while substantial features (social
 * graph, app passwords, group import) are pages in their own right. New
 * settings slot into an existing page's sections or a new page without
 * touching the layout.
 *
 * On mobile the rail is a master list; tapping a row drills into its page
 * with a back control. Both views render the same DOM; `data-view` + CSS
 * pick which is visible, so there's no desktop hydration flash.
 */
const GROUPS: PageGroup[] = [
  {
    label: "General",
    items: [
      {
        key: "account",
        label: "Account",
        description: "Your handle, sign-in email, and password.",
        Icon: CircleUser,
        sections: [
          {
            key: "username",
            title: "Username",
            description: "The @handle people use to find you on Certified.",
          },
          {
            key: "email",
            title: "Email",
            description: "Used to sign in and recover your account.",
          },
          {
            key: "password",
            title: "Password",
            description:
              "Lets you sign in to other AT Protocol apps (like Bluesky) with your handle. Your main sign-in here stays the passwordless email code.",
          },
        ],
      },
      {
        key: "appearance",
        label: "Appearance",
        description: "Set how Certified looks on this device.",
        Icon: Palette,
        sections: [{ key: "theme" }],
      },
      {
        key: "social-graph",
        label: "Sync social graph",
        navLabel: "Social graph",
        description:
          "Compare your Certified and Bluesky follows, and sync the missing ones in either direction.",
        Icon: Share2,
        sections: [{ key: "social-graph" }],
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
          "Create passwords for other apps. Shown once — revoke anytime.",
        Icon: Key,
        sections: [{ key: "app-passwords" }],
      },
      {
        key: "group",
        label: "Promote this account to a group account",
        navLabel: "Group account",
        description:
          "Turn this personal account into a shared group that several people can manage.",
        Icon: Users,
        sections: [{ key: "group" }],
      },
    ],
  },
]

const ALL_PAGES = GROUPS.flatMap((g) => g.items)
const DEFAULT_PAGE: PageKey = ALL_PAGES[0].key

/** Old per-field deep links (#username / #email / #password) now live as
 *  sections of the Account page — map them so shared links still land. */
const SECTION_HASH_ALIASES: Record<string, PageKey> = {
  username: "account",
  email: "account",
  password: "account",
}

function readHashPage(): PageKey | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.replace(/^#/, "").toLowerCase()
  const aliased = SECTION_HASH_ALIASES[raw]
  if (aliased) return aliased
  const match = ALL_PAGES.find((p) => p.key === raw)
  return match ? match.key : null
}

/**
 * Shared settings two-pane layout. Renders on both `/settings` and the
 * profile-page `?tab=settings` panel.
 */
export default function SettingsPanel() {
  const { did, pdsUrl } = useAuth()
  const { handle, email } = useSession()
  const { activeOrg, selfGroup } = useOrg()

  // `null` = no page actively selected. On desktop that resolves to the
  // first page (one is always shown); on mobile it means the master list is
  // showing. Driven by the `#<key>` hash so deep links + back/forward work.
  const [active, setActive] = useState<PageKey | null>(null)

  useEffect(() => {
    const sync = () => setActive(readHashPage())
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  const select = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, key: PageKey) => {
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

  // Acting as a group, OR the logged-in account is itself a group (you
  // promoted your own account) — either way show the group settings. For a
  // self-owned group the resolved handle can lag (DID-doc resolution), so
  // prefer the session handle (it's our own account) — otherwise settings and
  // the delete-confirm would show the raw DID instead of @handle.
  const settingsOrg =
    activeOrg ??
    (selfGroup
      ? { ...selfGroup, handle: handle || selfGroup.handle }
      : null)
  if (settingsOrg) {
    return <OrgSettings groupDid={settingsOrg.groupDid} org={settingsOrg} />
  }

  // The page whose panel renders on the right. On the mobile master list
  // (active === null) the panel is hidden, so the resolved default is moot.
  const selectedKey: PageKey = active ?? DEFAULT_PAGE
  const selected = ALL_PAGES.find((p) => p.key === selectedKey) ?? ALL_PAGES[0]

  const renderNavItem = (page: PageDef) => {
    const isActive = page.key === selectedKey
    const Icon = page.Icon
    return (
      <li key={page.key}>
        <a
          href={`#${page.key}`}
          aria-current={isActive ? "true" : undefined}
          className={`sx-menu__item${isActive ? " sx-menu__item--active" : ""}`}
          onClick={(e) => select(e, page.key)}
        >
          <span className="sx-menu__icon" aria-hidden>
            <Icon size={16} strokeWidth={1.75} />
          </span>
          <span className="sx-menu__label">{page.navLabel ?? page.label}</span>
          <ChevronRight className="sx-menu__chevron" size={16} aria-hidden />
        </a>
      </li>
    )
  }

  const renderSectionBody = (key: SectionKey) => {
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
      case "theme":
        return <ThemeToggle variant="cards" />
      case "social-graph":
        return did ? <SyncSocialGraphSection did={did} ownDid={did} /> : null
      case "app-passwords":
        return <AppPasswordsSection />
      case "group":
        return did ? <ImportAsGroupSection did={did} /> : null
    }
  }

  const renderPageBody = (page: PageDef) => {
    // A single-section page with a section title is really one labelled
    // control — render it as a SettingRow so the title/description sit beside
    // the control rather than stacked above a lone widget.
    if (page.sections.length === 1) {
      const only = page.sections[0]
      if (only.title) {
        return (
          <SettingRow title={only.title} description={only.description}>
            {renderSectionBody(only.key)}
          </SettingRow>
        )
      }
      return renderSectionBody(only.key)
    }
    return (
      <div className="sx-subsections">
        {page.sections.map((s) => (
          <div className="sx-subsection" key={s.key}>
            {s.title ? (
              <div className="sx-subsection__head">
                <h3 className="sx-subsection__title">{s.title}</h3>
                {s.description ? (
                  <p className="sx-subsection__desc">{s.description}</p>
                ) : null}
              </div>
            ) : null}
            {renderSectionBody(s.key)}
          </div>
        ))}
      </div>
    )
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
            <div className="sx-panel__body">{renderPageBody(selected)}</div>
          </section>
        </div>
      </div>
    </div>
  )
}
