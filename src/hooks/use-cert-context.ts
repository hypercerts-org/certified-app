"use client"

import { useEffect, useState } from "react"
import {
  fetchAllCertContext,
  type CertContextItem,
} from "@/lib/atproto/cert-context"

export function useCertContext(subjectUri: string | null): {
  items: CertContextItem[]
  isLoading: boolean
  error: string | null
} {
  const [items, setItems] = useState<CertContextItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!subjectUri) {
      setItems([])
      setIsLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    fetchAllCertContext(subjectUri, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return
        setItems(next)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error("[useCertContext] fetch failed:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch context")
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [subjectUri])

  return { items, isLoading, error }
}
