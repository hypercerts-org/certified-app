"use client";

import ErrorBoundaryFallback from "@/components/ui/error-boundary-fallback";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <ErrorBoundaryFallback
      error={error}
      onReset={reset}
      title="Something went wrong"
      message="An unexpected error occurred."
    />
  );
}
