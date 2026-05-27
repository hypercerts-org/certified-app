"use client"

import ErrorBoundaryFallback from "@/components/ui/error-boundary-fallback"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ExploreError({ error, reset }: ErrorPageProps) {
  return (
    <ErrorBoundaryFallback
      error={error}
      onReset={reset}
      title="Couldn't load Explore"
      message="Something went wrong loading the explore page. Try again, or check back in a moment."
    />
  )
}
