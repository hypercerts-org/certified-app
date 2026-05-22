"use client"

import { useEffect, useState } from "react"
import {
  fetchContextUpdates,
  type ContextAttachmentRecord,
} from "@/lib/atproto/context-attachment"
import { parseAtUri } from "@/lib/atproto/activity-uri"

/**
 * Fetch `org.hypercerts.context.attachment` records with
 * `contentType === "update"` that target `subjectUri` (a cert or
 * project at:// URI). The author DID is parsed from `subjectUri`
 * because the indexer hasn't ingested this lexicon yet — see
 * `fetchContextUpdates` for the stopgap caveat.
 *
 * Returns updates ordered by `createdAt` DESC (newest first).
 */
export function useContextUpdates(subjectUri: string | null): {
  updates: ContextAttachmentRecord[]
  isLoading: boolean
  error: string | null
} {
  const [updates, setUpdates] = useState<ContextAttachmentRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!subjectUri) {
      setUpdates([])
      setIsLoading(false)
      setError(null)
      return
    }

    const parsed = parseAtUri(subjectUri)
    if (!parsed?.did) {
      setUpdates([])
      setIsLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    fetchContextUpdates(parsed.did, subjectUri, controller.signal)
      .then((records) => {
        if (controller.signal.aborted) return
        const sorted = [...records].sort((a, b) => {
          const ac = a.value.createdAt ?? ""
          const bc = b.value.createdAt ?? ""
          return ac < bc ? 1 : ac > bc ? -1 : 0
        })
        setUpdates(sorted)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error("Failed to fetch context updates:", err)
        setError(
          err instanceof Error ? err.message : "Failed to fetch updates",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [subjectUri])

  return { updates, isLoading, error }
}
