"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { fetchUnreadCount, NotificationsUnauthenticatedError } from "@/lib/atproto/notifications"

const POLL_INTERVAL_MS = 60_000
// Circuit-breaker for the polling loop. The unread-count endpoint can
// 503 for sustained stretches (e.g. notifications service down); without
// backoff the 60s loop would hammer it forever. On each consecutive
// failure we double the delay up to a cap; on the Nth failure we open
// the breaker and stop auto-polling entirely until a user-triggered
// refresh (visiting the page, etc.) succeeds and closes it again.
const MAX_BACKOFF_MS = 15 * 60_000 // 15 min ceiling between auto-retries
const CIRCUIT_OPEN_AFTER = 5 // stop auto-polling after this many failures in a row

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
  const [count, setCount] = useState(0)
  const [more, setMore] = useState(false)
  const [ready, setReady] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // Consecutive-failure counter that drives the polling backoff/circuit
  // breaker. Lives in a ref (not state) so updating it never re-renders
  // the badge and never re-creates `refresh`. Reset to 0 on any success.
  const failureCountRef = useRef(0)

  const refresh = useCallback(async () => {
    if (authLoading || !isAuthenticated || !did) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await fetchUnreadCount(controller.signal)
      if (!controller.signal.aborted) {
        setCount(result.count)
        setMore(result.more)
        setReady(true)
      }
      // Success closes the circuit breaker so auto-polling resumes at the
      // normal cadence after a recovery.
      failureCountRef.current = 0
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
        // Auth state, not a service outage — don't trip the breaker.
        return
      }
      // Genuine transient failure (e.g. 503). Keep the last known count
      // instead of zeroing the badge and tick the failure counter so the
      // poll loop backs off / opens the breaker.
      failureCountRef.current += 1
      console.warn("[Notifications] unread count refresh failed:", err)
    }
  }, [authLoading, isAuthenticated, did])

  const markOptimisticallyZero = useCallback(() => {
    setCount(0)
    setMore(false)
  }, [])

  // Reset state on sign-out
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      abortRef.current?.abort()
      failureCountRef.current = 0
      setCount(0)
      setMore(false)
      setReady(false)
    }
  }, [authLoading, isAuthenticated])

  // Initial fetch + self-scheduling poll loop, paused while tab hidden.
  // Uses a chained setTimeout (not setInterval) so the delay before the
  // next tick can grow with consecutive failures: normal cadence while
  // healthy, exponential backoff up to a cap while failing, and a full
  // stop once the breaker opens. A user-triggered `refresh()` that
  // succeeds resets the counter and the loop returns to normal cadence.
  useEffect(() => {
    if (authLoading || !isAuthenticated || !did) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let running = false

    const clear = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    // Delay before the next poll, derived from the live failure count.
    const nextDelay = (): number => {
      const failures = failureCountRef.current
      if (failures === 0) return POLL_INTERVAL_MS
      // Double per failure: 2x, 4x, 8x … clamped to the ceiling.
      const backoff = POLL_INTERVAL_MS * 2 ** failures
      return Math.min(backoff, MAX_BACKOFF_MS)
    }

    const schedule = () => {
      clear()
      // Breaker open: stop auto-polling. The next successful user-driven
      // refresh (or a visibility resume that succeeds) re-arms the loop.
      if (failureCountRef.current >= CIRCUIT_OPEN_AFTER) return
      timer = setTimeout(tick, nextDelay())
    }

    const tick = async () => {
      await refresh()
      // `running` guards against scheduling after the effect tore down
      // (e.g. sign-out / unmount happened mid-fetch).
      if (running) schedule()
    }

    const start = () => {
      if (running) return
      running = true
      // Visibility resume always retries immediately, even with the
      // breaker open — treat the user returning to the tab as intent to
      // see fresh counts and a chance to recover.
      tick()
    }
    const stop = () => {
      running = false
      clear()
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
