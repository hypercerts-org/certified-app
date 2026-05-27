"use client"

import ErrorBoundaryFallback from "@/components/ui/error-boundary-fallback"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function EndorsementsError({ error, reset }: ErrorPageProps) {
  return (
    <ErrorBoundaryFallback
      error={error}
      onReset={reset}
      title="Couldn't load endorsements"
      message="Something went wrong loading the endorsements page. Try again, or head back home."
    />
  )
}
