"use client"

import ErrorBoundaryFallback from "@/components/ui/error-boundary-fallback"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ProfileError({ error, reset }: ErrorPageProps) {
  return (
    <ErrorBoundaryFallback
      error={error}
      onReset={reset}
      title="Couldn't load this profile"
      message="Something went wrong loading this profile. Try again, or head back home."
    />
  )
}
