"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { MessageSquare } from "lucide-react"
import { useFeedback } from "@/lib/feedback-context"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { isFeedbackTriggerVisible } from "@/lib/layout/feedback-trigger-visibility"

/**
 * Floating "Feedback" button, pinned bottom-right on desktop (≥800px), in
 * the secondary style (surface + hairline; layout.css). Opening is
 * delegated to the shared <FeedbackModal> via `useFeedback()`, so this file
 * only owns the trigger and its placement.
 *
 * Phones don't get it: the bottom tab bar sits where it would float, and
 * "Send feedback" lives in the account sheet and the site footer. It also
 * stays off the pages that keep their own controls in that corner: Records
 * (row actions, the selection bar), record pages and create and edit forms
 * (`isFeedbackTriggerVisible`; CSS covers any page with a form action bar).
 *
 * When the <SiteFooter> scrolls into view the button lifts above it so it
 * never covers the footer links; otherwise it rests at the default offset.
 */
export default function FeedbackTrigger() {
  const { isOpen, openFeedback } = useFeedback()
  const pathname = usePathname()
  const { isDesktop } = useLayoutBreakpoints()
  // Pixel offset while lifted above the footer; null at rest, so the CSS
  // resting position applies.
  const [bottomOffset, setBottomOffset] = useState<number | null>(null)

  const updatePosition = useCallback(() => {
    const footer = document.querySelector(".site-footer")
    if (!footer) {
      setBottomOffset(null)
      return
    }
    const rect = footer.getBoundingClientRect()
    // Lift the button only while the footer is actually showing from below;
    // once it's scrolled past (or not yet reached) keep the resting offset.
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setBottomOffset(window.innerHeight - rect.top + 12)
    } else {
      setBottomOffset(null)
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    // Coalesce every trigger into one measure per frame. rAF also keeps the
    // first measure out of the synchronous effect body (cascading-render
    // lint) and lets the footer lay out before we read its rect.
    let raf = 0
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        updatePosition()
      })
    }
    schedule()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule, { passive: true })
    // Content often grows or shrinks after first paint as data loads, which
    // moves the footer without firing scroll or resize — leaving the button
    // stamped to a stale offset (overlapping the footer, or floating where
    // the footer used to be). Re-measure on any document reflow.
    const ro = new ResizeObserver(schedule)
    ro.observe(document.body)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      ro.disconnect()
    }
  }, [updatePosition, isDesktop])

  // Hidden on phones (see above), on the pages listed in
  // `isFeedbackTriggerVisible`, and while the feedback modal is open.
  if (!isDesktop || isOpen || !isFeedbackTriggerVisible(pathname)) return null

  return (
    <button
      type="button"
      className="feedback-trigger"
      style={bottomOffset === null ? undefined : { bottom: `${bottomOffset}px` }}
      onClick={() => openFeedback()}
      aria-label="Share feedback"
    >
      <MessageSquare size={16} strokeWidth={1.75} aria-hidden />
      <span>Feedback</span>
      <span className="feedback-trigger__beta">Beta</span>
    </button>
  )
}
