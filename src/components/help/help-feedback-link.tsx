"use client"

import { useFeedback } from "@/lib/feedback-context"

/**
 * Inline "feedback form" link for the (server-rendered) Help page —
 * opens the global feedback modal via `useFeedback()`. Kept in its own
 * client file so the Help page itself can stay a server component (and
 * keep exporting `metadata`).
 */
export default function HelpFeedbackLink() {
  const { openFeedback } = useFeedback()
  return (
    <button
      type="button"
      onClick={() => openFeedback()}
      className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
    >
      feedback form
    </button>
  )
}
