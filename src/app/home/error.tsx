"use client"

import ErrorBoundaryFallback from "@/components/ui/error-boundary-fallback"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function HomeError({ error, reset }: ErrorPageProps) {
  return (
    <ErrorBoundaryFallback
      error={error}
      onReset={reset}
      title="Couldn't load the feed"
      message="Something went wrong loading your home feed. Try again, or head somewhere else for now."
    />
  )
}
