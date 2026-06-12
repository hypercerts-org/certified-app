"use client"

import { useFeedback } from "@/lib/feedback-context"

/**
 * Footer "Feedback" link — opens the global feedback modal via
 * `useFeedback()`. Lives in its own client file so `<SiteFooter>`
 * itself can stay a server component.
 */
export default function FeedbackFooterLink() {
  const { openFeedback } = useFeedback()
  return (
    <button
      type="button"
      onClick={() => openFeedback()}
      className="site-footer__link site-footer__link--button"
    >
      Feedback
    </button>
  )
}
