"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { fetchUnreadCount, NotificationsUnauthenticatedError } from "@/lib/atproto/notifications"
import { useManagedAuthors } from "@/hooks/use-managed-authors"
import { NOTIFICATIONS_AGGREGATION_ENABLED } from "@/lib/utils/config"

const POLL_INTERVAL_MS = 60_000

interface NotificationsContextValue {
  count: number
  more: boolean
  /** True before the first successful fetch completes. Used to suppress badge flash. */
  ready: boolean
  /** Force an immediate re-fetch. */
  refresh: () => Promise<void>
  /** Optimistically set count to 0; use after firing mark-seen. */
  markOptimisticallyZero: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, did } = useAuth()
  // The badge counts unread across the viewer's managed identities when
  // aggregation is on. `authors` is [viewerDid, ...owned/admin groups];
  // a lone viewer (length <= 1) needs no `recipients` arg, so the default
  // (personal) count path runs unchanged. Safe to call here:
  // NotificationsProvider is mounted under OrgProvider in app/layout.tsx.
  const { authors } = useManagedAuthors()
  const authorsKey = authors.join(",")
  const recipients = useMemo(
    () =>
      NOTIFICATIONS_AGGREGATION_ENABLED && authors.length > 1 ? authors : undefined,
    // authorsKey is the stable identity of `authors`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authorsKey],
  )
  const [count, setCount] = useState(0)
  const [more, setMore] = useState(false)
  const [ready, setReady] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (authLoading || !isAuthenticated || !did) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await fetchUnreadCount(recipients, controller.signal)
      if (!controller.signal.aborted) {
        setCount(result.count)
        setMore(result.more)
        setReady(true)
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      if (err instanceof NotificationsUnauthenticatedError) {
        // Expected when the session isn't established yet or has expired.
        // authFetch triggered the re-auth flow; reset local state silently.
        if (!controller.signal.aborted) {
          setCount(0)
          setMore(false)
          setReady(false)
        }
        return
      }
      // On transient failure, keep the last known count instead of
      // silently zeroing the badge. Next poll tick will retry.
      console.warn("[Notifications] unread count refresh failed:", err)
    }
  }, [authLoading, isAuthenticated, did, recipients])

  const markOptimisticallyZero = useCallback(() => {
    setCount(0)
    setMore(false)
  }, [])

  // Reset state on sign-out
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      abortRef.current?.abort()
      setCount(0)
      setMore(false)
      setReady(false)
    }
  }, [authLoading, isAuthenticated])

  // Initial fetch + interval polling, paused while tab hidden
  useEffect(() => {
    if (authLoading || !isAuthenticated || !did) return

    let interval: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (interval) return
      refresh()
      interval = setInterval(refresh, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", handleVisibility)
      abortRef.current?.abort()
    }
  }, [authLoading, isAuthenticated, did, refresh])

  const value = useMemo<NotificationsContextValue>(
    () => ({ count, more, ready, refresh, markOptimisticallyZero }),
    [count, more, ready, refresh, markOptimisticallyZero],
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    // Allow usage outside provider (e.g., during hot reload) with safe defaults
    return {
      count: 0,
      more: false,
      ready: false,
      refresh: async () => {},
      markOptimisticallyZero: () => {},
    }
  }
  return ctx
}
