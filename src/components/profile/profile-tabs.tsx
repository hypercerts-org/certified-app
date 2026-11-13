"use client"

import { useEffect, useRef } from "react"
import { TabList, Tab } from "@/components/ui/tabs"

export interface ProfileTabItem {
  key: string
  label: string
  /** Non-interactive (e.g. while editing, only editable sections stay on). */
  disabled?: boolean
}

interface ProfileTabsProps {
  tabs: ProfileTabItem[]
  /** The active tab, to keep it in view when the strip scrolls. */
  active: string
  /** Pin the strip below the top bar while scrolling (off while editing,
   *  when the edit bar takes that place). */
  sticky?: boolean
}

/**
 * Scrolls `strip` sideways just enough to show its selected tab, leaving a
 * little room past it. A no-op when the tab is already in view or when
 * everything fits.
 */
function revealActiveTab(strip: HTMLElement, smooth: boolean) {
  const tab = strip.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  if (!tab || strip.scrollWidth <= strip.clientWidth) return
  const tabLeft =
    tab.getBoundingClientRect().left -
    strip.getBoundingClientRect().left +
    strip.scrollLeft
  const tabRight = tabLeft + tab.offsetWidth
  const viewLeft = strip.scrollLeft
  const viewRight = viewLeft + strip.clientWidth
  if (tabLeft >= viewLeft && tabRight <= viewRight) return
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  strip.scrollTo({
    left: tabLeft < viewLeft ? tabLeft - 24 : tabRight - strip.clientWidth + 32,
    behavior: smooth && !reduceMotion ? "smooth" : "auto",
  })
}

/**
 * The profile's section tabs, one strip for every width: an underline
 * `<TabList>` that scrolls sideways when the tabs don't fit (phones) and
 * stays pinned below the top bar while the page scrolls. Render inside the
 * page's `<Tabs>`; the page owns the value and the `?tab=` URL.
 */
export default function ProfileTabs({ tabs, active, sticky = true }: ProfileTabsProps) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  // The first reveal (page load, a deep link) jumps; later ones, after a
  // tab is chosen, glide.
  const revealedRef = useRef(false)

  // Keep the active tab visible in the scrolling strip, on load and
  // whenever the selection changes: a deep link (the trust line's
  // "Endorsed by" opens ?tab=endorsements) can select a tab that starts
  // off-screen. Scrolls the strip only, never the page.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    revealActiveTab(strip, revealedRef.current)
    revealedRef.current = true
  }, [active])

  // The tabs can still move after that: the web font swapping in, or the
  // Groups tab arriving once the session has loaded, shifts them sideways.
  // Reveal the active tab again whenever the row changes size (a swipe
  // along the strip doesn't resize it, so it is left alone).
  useEffect(() => {
    const strip = stripRef.current
    const list = strip?.querySelector('[role="tablist"]')
    if (!strip || !list || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => revealActiveTab(strip, false))
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={stripRef}
      className={`profile-tabs${sticky ? " profile-tabs--sticky" : ""}`}
      data-tour="profile-tabs"
    >
      <TabList aria-label="Profile sections" className="profile-tabs__list">
        {tabs.map((t) => (
          <Tab
            key={t.key}
            value={t.key}
            disabled={t.disabled}
            className="profile-tabs__tab"
          >
            {t.label}
          </Tab>
        ))}
      </TabList>
    </div>
  )
}
