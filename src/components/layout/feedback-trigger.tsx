"use client"

import { useCallback, useEffect, useState } from "react"
import { MessageSquare } from "lucide-react"
import { useFeedback } from "@/lib/feedback-context"

/**
 * Floating "Share Feedback" button, pinned bottom-right. It's the app's
 * primary door into the feedback modal (the footer no longer carries a
 * link). Opening is delegated to the shared <FeedbackModal> via
 * `useFeedback()`, so this file only owns the trigger and its placement.
 *
 * When the <SiteFooter> scrolls into view the button lifts above it so it
 * never covers the footer links; otherwise it rests at the default offset.
 */
export default function FeedbackTrigger() {
  const { isOpen, openFeedback } = useFeedback()
  const [bottomOffset, setBottomOffset] = useState(20)

  const updatePosition = useCallback(() => {
    const footer = document.querySelector(".site-footer")
    if (!footer) {
      setBottomOffset(20)
      return
    }
    const rect = footer.getBoundingClientRect()
    // Lift the button only while the footer is actually showing from below;
    // once it's scrolled past (or not yet reached) keep the resting offset.
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setBottomOffset(window.innerHeight - rect.top + 12)
    } else {
      setBottomOffset(20)
    }
  }, [])

  useEffect(() => {
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
  }, [updatePosition])

  if (isOpen) return null

  return (
    <button
      type="button"
      className="feedback-trigger"
      style={{ bottom: `${bottomOffset}px` }}
      onClick={() => openFeedback()}
      aria-label="Share feedback"
    >
      <MessageSquare size={16} />
      <span>Feedback</span>
      <span className="feedback-trigger__beta">Beta</span>
    </button>
  )
}
