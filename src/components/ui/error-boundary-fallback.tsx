"use client"

import React from "react"
import Link from "next/link"

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
  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">{title}</h1>
      </div>
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          <div className="dash-card">
            <p className="dash-card__desc">{message}</p>
            {error.digest ? (
              <p
                className="dash-card__desc"
                style={{ fontSize: "0.85em", opacity: 0.7 }}
              >
                Reference: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onReset}
              className="dashboard__back-btn"
              style={{ marginBottom: "0.5rem" }}
            >
              Try again
            </button>
            <Link href="/" className="dashboard__back-btn">
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
