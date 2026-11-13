"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CircleHelp, Info, MessageSquare, Route } from "lucide-react"
import SideNav, { type SideNavIcon } from "@/components/ui/side-nav"

export interface HelpSection {
  /** The section element's id; the link's `#hash`. */
  id: string
  label: string
}

/** Each section's SideNav icon, like the other SideNavs (Settings, Records,
 *  Explore). Keyed by section id here, in the client file, because the
 *  server-rendered page can't pass icon components across. */
const SECTION_ICONS: Readonly<Record<string, SideNavIcon>> = {
  about: Info,
  "walk-through": Route,
  questions: CircleHelp,
  feedback: MessageSquare,
}

/**
 * The Help page's contents: a SideNav of in-page links (a pill row above
 * the article below 1100px, a sticky column beside it from 1100px). The
 * current item follows the reader: the last section whose top has passed
 * the upper quarter of the viewport, or the last section once the page
 * can't scroll further. After a contents click the clicked item stays
 * current until the reader scrolls by hand, so a short last section, or a
 * jump that hits the bottom of the page, doesn't hand it to a neighbour.
 */
export default function HelpContents({ sections }: { sections: HelpSection[] }) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections])
  const [current, setCurrent] = useState(ids[0])
  const pinned = useRef<string | null>(null)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      if (pinned.current) return
      const line = window.innerHeight * 0.25
      let next = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) next = id
      }
      const atEnd =
        window.scrollY > 0 &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2
      setCurrent(atEnd ? ids[ids.length - 1] : next)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    // Scrolling by hand releases a clicked item.
    const release = () => {
      pinned.current = null
    }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    window.addEventListener("wheel", release, { passive: true })
    window.addEventListener("touchstart", release, { passive: true })
    window.addEventListener("keydown", release)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      window.removeEventListener("wheel", release)
      window.removeEventListener("touchstart", release)
      window.removeEventListener("keydown", release)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [ids])

  return (
    <SideNav
      aria-label="Help contents"
      // A grid child: without min-width 0 the pill row's full width would
      // widen the page on phones instead of scrolling.
      className="min-w-0"
      items={sections.map(({ id, label }) => ({
        key: id,
        label,
        icon: SECTION_ICONS[id],
        href: `#${id}`,
        current: id === current,
        onClick: () => {
          pinned.current = id
          setCurrent(id)
        },
      }))}
    />
  )
}
