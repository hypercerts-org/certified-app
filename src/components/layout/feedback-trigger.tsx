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
    // Defer the first measure to after paint so it doesn't setState
    // synchronously in the effect body (cascading-render lint), and so the
    // footer has laid out before we read its rect.
    const raf = requestAnimationFrame(updatePosition)
    window.addEventListener("scroll", updatePosition, { passive: true })
    window.addEventListener("resize", updatePosition, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", updatePosition)
      window.removeEventListener("resize", updatePosition)
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
      <span>Share Feedback</span>
    </button>
  )
}
