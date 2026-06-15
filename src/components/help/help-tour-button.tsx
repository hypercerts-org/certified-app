"use client"

import { useTour } from "@/lib/tour/tour-context"
import { useAuth } from "@/lib/auth/auth-context"
import Button from "@/components/ui/button"

/**
 * "Start the walk-through" button for the (server-rendered) Help page —
 * launches the product tour via `useTour()`. Kept in its own client file
 * so the Help page itself can stay a server component (and keep exporting
 * `metadata`). Mirrors the HelpFeedbackLink pattern.
 *
 * The tour visits authenticated surfaces (/home, /create, …), so for a
 * signed-out visitor the button prompts sign-in instead of starting a tour
 * that would only hit redirect walls.
 */
export default function HelpTourButton() {
  const { start } = useTour()
  const { isAuthenticated, openSignIn } = useAuth()
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={isAuthenticated ? start : openSignIn}
    >
      {isAuthenticated ? "Start the walk-through" : "Sign in to start the walk-through"}
    </Button>
  )
}
