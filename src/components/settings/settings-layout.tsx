"use client"

import React, { useCallback, useEffect, useId, useRef, useState } from "react"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import type { SideNavIcon } from "@/components/ui/side-nav"
import TabStripFades, { revealActiveTab } from "@/components/ui/tab-strip-fades"
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs"
import { useOverflowEdges } from "@/hooks/use-overflow-edges"

/**
 * The frame shared by personal settings (`SettingsPanel`) and group settings
 * (`OrgSettings`): the "Settings" header, the sections as a tab strip under
 * it (a page's own sections are tabs, as on Endorsements or a profile; the
 * app's navigation only lists pages, so there is no second menu), then the
 * open section at a reading width. The strip scrolls sideways on phones.
 *
 * One section shows at a time, picked by the URL hash (`/settings#account`),
 * so deep links, the product tour and `window.location.hash = …` hand-offs
 * keep working. Choosing a section replaces the hash rather than pushing a
 * history entry; focus stays on the tab (arrow keys move between them).
 */

export interface SettingsSectionDef<K extends string> {
  key: K
  /** Short label for the tab. */
  label: string
  /** Kept on the definitions; the tabs show labels only. */
  icon?: SideNavIcon
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
  /** An optional line under the title (a group: what your role there
   *  lets you do). The account control names the account. */
  description?: React.ReactNode
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
  const stripRef = useRef<HTMLDivElement>(null)
  const revealedRef = useRef(false)

  // Keep the open section's tab in view in the sideways-scrolling strip
  // (phones): a deep link can open a section whose tab starts off-screen.
  // Scrolls the strip only, never the page.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    revealActiveTab(strip, revealedRef.current)
    revealedRef.current = true
  }, [current])

  const edges = useOverflowEdges(stripRef)

  return (
    <PageContainer>
      <PageHeader title="Settings" description={description} />
      <Tabs value={current} onChange={(next) => onSelect(next as K)}>
        <div className="settings-tabs">
          <div ref={stripRef} className="settings-tabs__scroller">
            <TabList aria-label={navLabel} className="settings-tabs__list">
              {sections.map(({ key, label }) => (
                <Tab key={key} value={key}>
                  {label}
                </Tab>
              ))}
            </TabList>
          </div>
          <TabStripFades start={edges.start} end={edges.end} />
        </div>
        <TabPanel value={current} className="settings-section">
          {/* The tab names the section; the heading stays for the outline
              and screen readers. */}
          <h2 id={SECTION_TITLE_ID} className="sr-only">
            {title}
          </h2>
          {sectionDescription ? (
            <p className="settings-section__description">{sectionDescription}</p>
          ) : null}
          <div className="settings-section__body">{children}</div>
        </TabPanel>
      </Tabs>
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
