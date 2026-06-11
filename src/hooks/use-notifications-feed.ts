"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fetchNotifications, NotificationsUnauthenticatedError, type Notification } from "@/lib/atproto/notifications"

const PAGE_SIZE = 50

export function useNotificationsFeed(enabled: boolean) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  // Bumped by `retry()` to re-run the initial-load effect after a failure.
  const [reloadTick, setReloadTick] = useState(0)
  const endCursorRef = useRef<string | null>(null)
  const isLoadingMoreRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setNotifications([])
      setIsLoading(false)
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
          signal: controller.signal,
        })
        if (cancelled) return
        setNotifications(page.records)
        setHasMore(page.hasMore)
        endCursorRef.current = page.endCursor
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) return
        if (err instanceof NotificationsUnauthenticatedError) {
          // Not authenticated — feed hook will re-run when auth state updates
          setNotifications([])
          setHasMore(false)
          return
        }
        // Surface a friendly, user-facing message — never the raw HTTP
        // status (e.g. "Notifications request failed: 503"). The detail is
        // still logged for debugging; the UI shows guidance + a Retry.
        if (err) console.warn("[Notifications] feed load failed:", err)
        setError("We couldn't load your notifications right now.")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [enabled, reloadTick])

  // User-triggered retry after an error. Bumps the reload tick so the
  // initial-load effect re-runs from scratch.
  const retry = useCallback(() => {
    setReloadTick(t => t + 1)
  }, [])

  const loadMore = useCallback(async () => {
    if (!endCursorRef.current || isLoadingMoreRef.current) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const page = await fetchNotifications({
        first: PAGE_SIZE,
        after: endCursorRef.current,
      })
      setNotifications(prev => {
        const seen = new Set(prev.map(n => n.id))
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
  }, [])

  return { notifications, isLoading, isLoadingMore, error, hasMore, loadMore, retry }
}
