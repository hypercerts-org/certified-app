"use client"

import { useEffect } from "react"
import { useTour } from "@/lib/tour/tour-context"
import { useAuth } from "@/lib/auth/auth-context"
import Button from "@/components/ui/button"

/** Set when a signed-out visitor asks for the walk-through: sign-in
 *  leaves the page (the provider's redirect) and comes back to /help,
 *  where the walk-through then starts. Holds the time it was set. */
export const TOUR_AFTER_SIGN_IN_KEY = "certified_help_tour_after_sign_in"
/** A sign-in that takes longer than this was abandoned: an old request
 *  doesn't start the walk-through on a later visit. */
const TOUR_AFTER_SIGN_IN_MAX_AGE_MS = 15 * 60 * 1000

/** Read and clear the request; true when it is recent enough to honour. */
function takeTourRequest(): boolean {
  try {
    const raw = sessionStorage.getItem(TOUR_AFTER_SIGN_IN_KEY)
    if (raw === null) return false
    sessionStorage.removeItem(TOUR_AFTER_SIGN_IN_KEY)
    const at = Number(raw)
    return Number.isFinite(at) && Date.now() - at < TOUR_AFTER_SIGN_IN_MAX_AGE_MS
  } catch {
    // Storage blocked: the walk-through just doesn't resume.
    return false
  }
}

/**
 * "Start the walk-through" button for the (server-rendered) Help page —
 * launches the product tour via `useTour()`. Kept in its own client file
 * so the Help page itself can stay a server component (and keep exporting
 * `metadata`). Mirrors the HelpFeedbackLink pattern.
 *
 * The tour visits authenticated surfaces (/home, /create, …), so for a
 * signed-out visitor the button prompts sign-in instead of starting a tour
 * that would only hit redirect walls; the request is remembered across
 * the sign-in, and the walk-through starts once they're back signed in.
 */
export default function HelpTourButton() {
  const { start } = useTour()
  const { isAuthenticated, openSignIn } = useAuth()

  useEffect(() => {
    if (isAuthenticated && takeTourRequest()) start()
  }, [isAuthenticated, start])

  const signInForTour = () => {
    try {
      sessionStorage.setItem(TOUR_AFTER_SIGN_IN_KEY, String(Date.now()))
    } catch {
      // Storage blocked: sign-in still works, the walk-through won't resume.
    }
    void openSignIn()
  }

  return (
    <Button variant="secondary" onClick={isAuthenticated ? start : signInForTour}>
      {isAuthenticated ? "Start the walk-through" : "Sign in to start the walk-through"}
    </Button>
  )
}
