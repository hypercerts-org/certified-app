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
 * The profile's section tabs, one strip for every width: an underline
 * `<TabList>` that scrolls sideways when the tabs don't fit (phones) and
 * stays pinned below the top bar while the page scrolls. Render inside the
 * page's `<Tabs>`; the page owns the value and the `?tab=` URL.
 */
export default function ProfileTabs({ tabs, active, sticky = true }: ProfileTabsProps) {
  const stripRef = useRef<HTMLDivElement | null>(null)

  // Keep the active tab visible in the scrolling strip: a deep link (the
  // trust line's "Endorsed by" opens ?tab=endorsements) can select a tab
  // that starts off-screen. Scrolls the strip only, never the page; a
  // no-op when everything fits.
  useEffect(() => {
    const strip = stripRef.current
    const tab = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return
    const tabLeft =
      tab.getBoundingClientRect().left -
      strip.getBoundingClientRect().left +
      strip.scrollLeft
    const tabRight = tabLeft + tab.offsetWidth
    const viewLeft = strip.scrollLeft
    const viewRight = viewLeft + strip.clientWidth
    if (tabLeft >= viewLeft && tabRight <= viewRight) return
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // Leave room for the edge fade.
    strip.scrollTo({
      left: tabLeft < viewLeft ? tabLeft - 24 : tabRight - strip.clientWidth + 32,
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }, [active])

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
