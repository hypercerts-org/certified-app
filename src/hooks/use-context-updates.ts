"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
 * Hard contract — **creator-only**: only updates authored by the
 * cert / project's own creator are returned. Third-party updates
 * (someone publishing an attachment about someone else's record)
 * are a separate feature and are filtered out at the lib layer.
 *
 * Returns updates ordered by `createdAt` DESC (newest first).
 */
export function useContextUpdates(subjectUri: string | null): {
  updates: ContextAttachmentRecord[]
  isLoading: boolean
  error: string | null
  /** Force a re-fetch — call after creating / deleting an update so the
   *  list reflects the change without a full page reload. */
  refetch: () => void
  /**
   * Optimistically drop an update from the list by its at:// URI. Use
   * right after a successful delete so the card disappears instantly
   * instead of waiting on the indexer (which lags and would otherwise
   * keep returning the just-deleted record on the next refetch). The URI
   * is remembered so a stale refetch can't resurrect it.
   */
  removeUpdate: (uri: string) => void
} {
  const [updates, setUpdates] = useState<ContextAttachmentRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  // URIs the viewer has deleted this session. The indexer is eventually
  // consistent, so a refetch fired right after a delete often still
  // includes the removed record; filtering against this set keeps it from
  // reappearing until the backend catches up.
  const removedUrisRef = useRef<Set<string>>(new Set())
  const removeUpdate = useCallback((uri: string) => {
    removedUrisRef.current.add(uri)
    setUpdates((prev) => prev.filter((u) => u.uri !== uri))
  }, [])

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
        const sorted = [...records]
          // Drop anything deleted this session — the indexer may still be
          // serving it (see removedUrisRef).
          .filter((r) => !removedUrisRef.current.has(r.uri))
          .sort((a, b) => {
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
  }, [subjectUri, reloadKey])

  return { updates, isLoading, error, refetch, removeUpdate }
}
