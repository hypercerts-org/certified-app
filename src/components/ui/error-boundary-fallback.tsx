"use client"

import React from "react"
import Button from "./button"
import EmptyState from "./empty-state"

/**
 * Shared fallback used by Next.js segment `error.tsx` files. Renders a
 * compact "couldn't load this section" surface with a Retry button
 * wired to the Next `reset` callback and a "Go home" link as the
 * always-available escape hatch.
 *
 * Segments that want their own copy can pass a custom `title` / `message`;
 * defaults read as a generic load-failure message that's safe across
 * every async-data route.
 */
export interface ErrorBoundaryFallbackProps {
  error: Error & { digest?: string }
  /** Next.js-supplied callback that re-renders the segment. */
  onReset: () => void
  /** Heading shown to the user. Defaults to "Couldn't load this section". */
  title?: string
  /** One-line summary above the digest. Defaults to a generic message. */
  message?: string
}

export default function ErrorBoundaryFallback({
  error,
  onReset,
  title = "Couldn't load this section",
  message = "Something went wrong while loading the page. Try again or head back home.",
}: ErrorBoundaryFallbackProps) {
  // EmptyState owns the centered block + headline (h1: the fallback IS the
  // page); the actions use the Button primitive, "Go home" in link mode.
  return (
    <EmptyState title={title} description={message} headingLevel={1}>
      {error.digest ? (
        <p className="mb-4 text-xs text-[var(--fg-muted)]">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="secondary" size="sm" onClick={onReset}>
          Try again
        </Button>
        <Button variant="ghost" size="sm" href="/">
          Go home
        </Button>
      </div>
    </EmptyState>
  )
}
