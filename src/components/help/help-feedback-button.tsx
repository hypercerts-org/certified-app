"use client"

import { MessageSquare } from "lucide-react"
import { useFeedback } from "@/lib/feedback-context"
import Button from "@/components/ui/button"

/**
 * "Send feedback" for the (server-rendered) Help page: opens the global
 * feedback modal via `useFeedback()`. Kept in its own client file so the
 * Help page itself can stay a server component (and keep exporting
 * `metadata`).
 */
export default function HelpFeedbackButton() {
  const { openFeedback } = useFeedback()
  return (
    <Button variant="primary" onClick={() => openFeedback()}>
      <MessageSquare size={16} strokeWidth={1.75} aria-hidden />
      Send feedback
    </Button>
  )
}
