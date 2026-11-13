"use client"

import React, { useCallback, useEffect, useId, useRef, useState } from "react"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SectionHeader from "@/components/ui/section-header"
import SideNav, { type SideNavIcon } from "@/components/ui/side-nav"

/**
 * The frame shared by personal settings (`SettingsPanel`) and group settings
 * (`OrgSettings`): the page header naming the account, a SideNav of sections
 * (a pill row below 1100px, a sticky column from 1100px) and the one
 * selected section beside it.
 *
 * One section shows at a time, picked by the URL hash (`/settings#account`),
 * so deep links, the product tour and `window.location.hash = …` hand-offs
 * keep working. Choosing a section replaces the hash rather than pushing a
 * history entry, and moves focus to the new section's heading so a
 * keyboard or screen-reader user hears which section opened.
 */

export interface SettingsSectionDef<K extends string> {
  key: K
  /** Short label for the SideNav. */
  label: string
  icon: SideNavIcon
}

/** The section heading's id; the section region points at it. */
const SECTION_TITLE_ID = "settings-section-title"

function readHash<K extends string>(
  keys: readonly K[],
  aliases: Readonly<Record<string, K>>,
): K | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.replace(/^#/, "").toLowerCase()
  const key = aliases[raw] ?? raw
  return (keys as readonly string[]).includes(key) ? (key as K) : null
}

/**
 * The section named by the URL hash, or `null` when the hash names none.
 * `keys` and `aliases` must be stable (module constants): old deep links
 * such as `#email` map onto the section that now holds them.
 */
export function useHashSection<K extends string>(
  keys: readonly K[],
  aliases: Readonly<Record<string, K>> = {},
): [K | null, (key: K) => void] {
  const [active, setActive] = useState<K | null>(null)

  useEffect(() => {
    const sync = () => setActive(readHash(keys, aliases))
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [keys, aliases])

  const select = useCallback((key: K) => {
    setActive(key)
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}#${key}`,
    )
  }, [])

  return [active, select]
}

export interface SettingsLayoutProps<K extends string> {
  /** One line naming the account these settings apply to. */
  description: React.ReactNode
  /** Names the SideNav for assistive tech. */
  navLabel: string
  sections: SettingsSectionDef<K>[]
  current: K
  onSelect: (key: K) => void
  /** The selected section's title and one-line explanation. */
  title: string
  sectionDescription?: React.ReactNode
  children: React.ReactNode
}

export default function SettingsLayout<K extends string>({
  description,
  navLabel,
  sections,
  current,
  onSelect,
  title,
  sectionDescription,
  children,
}: SettingsLayoutProps<K>) {
  const navRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  // The section a nav click asked for; its heading takes focus once it has
  // rendered. Deep links and the first render leave focus alone.
  const focusPending = useRef<K | null>(null)

  // Focus the selected section's heading (tabindex -1: focusable from
  // script, not a Tab stop). Focus lands on the heading, so its name is
  // announced and Tab continues into the section. No scroll: the click
  // handler has already brought the section into view.
  const focusTitle = useCallback(() => {
    const heading = document.getElementById(SECTION_TITLE_ID)
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (focusPending.current !== current) return
    focusPending.current = null
    focusTitle()
  }, [current, focusTitle])

  // Phones: keep the current pill in view in the scrolling row (a deep link
  // can pick a section whose pill starts off-screen). Scrolls the row only,
  // never the page; a no-op from 1100px, where the list doesn't scroll.
  useEffect(() => {
    const list = navRef.current?.querySelector("ul")
    const pill = list?.querySelector("[aria-current]")
    if (!list || !pill || list.scrollWidth <= list.clientWidth) return
    const row = list.getBoundingClientRect()
    const box = pill.getBoundingClientRect()
    if (box.left < row.left || box.right > row.right) {
      list.scrollLeft += box.left - row.left - 16
    }
  }, [current])

  const items = sections.map(({ key, label, icon }) => ({
    key,
    label,
    icon,
    href: `#${key}`,
    current: key === current,
    // A plain click swaps the section in place (no history entry, no
    // jump); modified clicks fall through to the link so "open in new
    // tab" still lands on the section.
    onClick: (e?: React.MouseEvent) => {
      if (e && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
        return
      }
      e?.preventDefault()
      // If the section's top has scrolled up under the top bar (a long
      // section, with the sticky nav still in view), bring it back.
      const top = mainRef.current?.getBoundingClientRect().top ?? 0
      if (top < 0) window.scrollTo({ top: 0 })
      if (key === current) {
        // Already showing: nothing re-renders, so focus it now.
        focusTitle()
        return
      }
      focusPending.current = key
      onSelect(key)
    },
  }))

  return (
    <PageContainer>
      <PageHeader title="Settings" description={description} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div ref={navRef} className="min-w-0">
          <SideNav aria-label={navLabel} items={items} />
        </div>
        <section
          ref={mainRef}
          aria-labelledby={SECTION_TITLE_ID}
          className="flex min-w-0 flex-col gap-4"
        >
          <SectionHeader
            id={SECTION_TITLE_ID}
            title={title}
            description={sectionDescription}
          />
          <div className="settings-section__body">{children}</div>
        </section>
      </div>
    </PageContainer>
  )
}

export interface SettingsRowProps {
  label: string
  /** One line on what the setting does. */
  description?: React.ReactNode
  /** The control: a value with its action, a toggle, a small form. */
  children: React.ReactNode
  className?: string
}

/**
 * One setting: its label and a one-line explanation, then the control.
 * Side by side from 800px, stacked below. Rows follow each other with a
 * hairline between them.
 */
export function SettingsRow({
  label,
  description,
  children,
  className = "",
}: SettingsRowProps) {
  const labelId = useId()
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={`settings-row ${className}`.trim()}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3
          id={labelId}
          className="m-0 text-body-sm font-medium text-[var(--fg-primary)] text-balance"
        >
          {label}
        </h3>
        {description ? (
          <p className="m-0 max-w-measure text-body-sm text-[var(--fg-muted)] text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}

/**
 * A full-width part of a section that isn't a single setting (a list of
 * members, the activity log, the follow comparison). Its optional label
 * matches a row's; it sits in the same hairline rhythm as the rows.
 */
export function SettingsBlock({
  title,
  description,
  children,
  className = "",
}: {
  title?: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const titleId = useId()
  return (
    <div
      role={title ? "group" : undefined}
      aria-labelledby={title ? titleId : undefined}
      className={`settings-block ${className}`.trim()}
    >
      {title ? (
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            id={titleId}
            className="m-0 text-body-sm font-medium text-[var(--fg-primary)] text-balance"
          >
            {title}
          </h3>
          {description ? (
            <p className="m-0 max-w-measure text-body-sm text-[var(--fg-muted)] text-pretty">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

/** A short muted note under or between rows. */
export function SettingsNote({
  children,
  role,
}: {
  children: React.ReactNode
  role?: "status" | "alert"
}) {
  return (
    <p
      role={role}
      className={`m-0 max-w-measure text-ui ${
        role === "alert" ? "text-[var(--color-error)]" : "text-[var(--fg-muted)]"
      } text-pretty`}
    >
      {children}
    </p>
  )
}
