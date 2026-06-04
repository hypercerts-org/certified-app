"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  fetchNotifications,
  NotificationsUnauthenticatedError,
  type Notification,
} from "@/lib/atproto/notifications"
import { useAuth } from "@/lib/auth/auth-context"
import { useManagedAuthors } from "./use-managed-authors"
import { ownerTagForDid, type OwnerTag } from "@/lib/atproto/owner-tag"

const PAGE_SIZE = 50

/** A notification plus the provenance tag of the identity it belongs to. */
export interface ManagedNotification {
  notification: Notification
  /** Who this notification is for — the viewer ("You") or a group. */
  owner: OwnerTag
}

export interface ManagedNotificationsResult {
  items: ManagedNotification[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
}

/**
 * Aggregated notifications feed across the viewer's managed identities
 * (personal + owned/admin groups). Mirrors {@link useNotificationsFeed}
 * but sends the multi-recipient `recipients` set from
 * {@link useManagedAuthors} and tags each row with the identity it
 * belongs to (so the UI can show "via {group}").
 *
 * This is the aggregated counterpart used only when the
 * NOTIFICATIONS_AGGREGATION flag is on (the page picks between this and
 * the personal `useNotificationsFeed`). It still relies on the indexer
 * accepting `recipients` — see
 * docs/org-identity/indexer-notifications-aggregation.md.
 *
 * Pagination follows the personal feed's union-cursor caveat: a single
 * cursor walks the merged recipient stream server-side, deduped by id on
 * the client.
 */
export function useManagedNotifications(enabled: boolean): ManagedNotificationsResult {
  const { did } = useAuth()
  const { authors, byDid, isLoading: authorsLoading } = useManagedAuthors()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const endCursorRef = useRef<string | null>(null)
  const isLoadingMoreRef = useRef(false)

  const authorsKey = authors.join(",")
  const active = enabled && authors.length > 0

  useEffect(() => {
    if (!active) {
      setNotifications([])
      setHasMore(false)
      endCursorRef.current = null
      // Stay in the loading state while authors are still resolving so the
      // page shows skeletons rather than a premature empty state.
      setIsLoading(enabled && authorsLoading)
      return
    }

    const controller = new AbortController()
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const page = await fetchNotifications({
          first: PAGE_SIZE,
          recipients: authors,
          signal: controller.signal,
        })
        if (cancelled) return
        setNotifications(page.records)
        setHasMore(page.hasMore)
        endCursorRef.current = page.endCursor
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) return
        if (err instanceof NotificationsUnauthenticatedError) {
          setNotifications([])
          setHasMore(false)
          return
        }
        setError(err instanceof Error ? err.message : "Failed to load notifications")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, authorsKey, authorsLoading, enabled])

  const loadMore = useCallback(async () => {
    if (!endCursorRef.current || isLoadingMoreRef.current || !active) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const page = await fetchNotifications({
        first: PAGE_SIZE,
        after: endCursorRef.current,
        recipients: authors,
      })
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id))
        const merged = [...prev]
        for (const n of page.records) {
          if (!seen.has(n.id)) {
            merged.push(n)
            seen.add(n.id)
          }
        }
        return merged
      })
      setHasMore(page.hasMore)
      endCursorRef.current = page.endCursor
    } catch {
      setHasMore(false)
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, authorsKey])

  const items = useMemo<ManagedNotification[]>(
    () =>
      notifications.map((notification) => {
        // The recipient is the DID being notified — the identity this row
        // belongs to. When the indexer omits it (shouldn't, on the
        // aggregated path) fall back to the viewer so we never mislabel a
        // personal notification as a group's.
        const recipientDid = notification.recipient ?? did ?? ""
        return {
          notification,
          owner: ownerTagForDid(recipientDid, byDid, did),
        }
      }),
    [notifications, byDid, did],
  )

  return {
    items,
    isLoading: isLoading || (enabled && authorsLoading),
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  }
}
