"use client"

import React from "react"
import { useAuth } from "@/lib/auth/auth-context"
import EmptyState, { type EmptyStateIcon } from "@/components/ui/empty-state"
import Button from "@/components/ui/button"

export interface SignedOutPromptProps {
  /** Lucide / CertIcon-shaped icon shown above the headline. */
  icon?: EmptyStateIcon
  /** Headline, e.g. "Sign in to see your endorsements". */
  title: string
  /** One-line explanation of what lives behind sign-in. */
  description: string
  /** Sign-in button label. Defaults to "Sign in". */
  ctaLabel?: string
  /** Headline level; 2 when the prompt stands in for a whole page. */
  headingLevel?: 2 | 3
}

/**
 * Public placeholder for personal, owner-scoped surfaces (e.g.
 * /endorsements, /groups) when the visitor is signed out. These pages
 * have no public listing to render — the data is keyed on the viewer's
 * own DID — so instead of bouncing anonymous visitors to /welcome we
 * render an explanation plus a sign-in affordance in place.
 *
 * Wraps the `EmptyState` primitive and the shared `openSignIn` flow so
 * every "this surface needs a session" prompt reads identically.
 */
export default function SignedOutPrompt({
  icon,
  title,
  description,
  ctaLabel = "Sign in",
  headingLevel = 3,
}: SignedOutPromptProps) {
  const { openSignIn } = useAuth()
  return (
    <EmptyState icon={icon} title={title} description={description} headingLevel={headingLevel}>
      <Button variant="primary" size="md" onClick={() => void openSignIn()}>
        {ctaLabel}
      </Button>
    </EmptyState>
  )
}
