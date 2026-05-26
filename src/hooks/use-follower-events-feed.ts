"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useHomeFeedAuthors } from "@/hooks/use-home-feed-authors"
import {
  fetchFollowerEvents,
  hydrateFeedEvents,
  FollowerEventsError,
  DEFAULT_FEED_PAGE_SIZE,
  FOREGROUND_POLL_MS,
  BACKGROUND_POLL_MS,
  type FollowerEventsErrorCode,
  type HydratedFeedEvent,
} from "@/lib/atproto/follower-events"

export interface UseFollowerEventsFeedOptions {
  /** Optional inclusion filter forwarded to the indexer. */
  kinds?: string[]
}

export interface UseFollowerEventsFeedResult {
  events: HydratedFeedEvent[]
  /** Size of the (truncated, deduped) author union currently in use. */
  authorsCount: number
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  /**
   * Typed code when the error came from `FollowerEventsError`; null
   * for hydration errors and network failures.
   */
  errorCode: FollowerEventsErrorCode | null
  hasMore: boolean
  /** Authors union > MAX_AUTHORS_FILTER_SIZE (truncated client-side). */
  isOversized: boolean
  /** Either upstream follow-set hook hit its 10k page-walk cap. */
  truncatedBySource: boolean
  loadMore: () => void
  refresh: () => Promise<void>
}

/**
 * Home-timeline feed hook. Wires up:
 *
 *   - viewer DID (from `useAuth`)
 *   - author union (from `useHomeFeedAuthors`)
 *   - paged fetch of `followerEvents`
 *   - per-page hydration via `hydrateFeedEvents`
 *   - visibility-aware polling (30s foreground / 5min background)
 *
 * State machine:
 *   - Initial load fires whenever the stable `(authors, kinds)` key
 *     changes. Aborts in flight via `AbortController` if the key
 *     changes mid-fetch.
 *   - `loadMore` paginates with the saved `endCursor`. Returns
 *     silently if there's no cursor or another `loadMore` is already
 *     in flight.
 *   - `refresh` re-fetches page 1, merges by `event.id`. New events
 *     are prepended; already-loaded events keep their position; the
 *     pagination cursor is NOT reset (so a paginated user's
 *     `loadMore` history survives a poll). Polling calls `refresh`.
 *   - Polling pauses entirely when `authors.length === 0` (signed out
 *     or no follows). It also switches cadence on `visibilitychange`:
 *     `FOREGROUND_POLL_MS` when visible, `BACKGROUND_POLL_MS` otherwise.
 */
export function useFollowerEventsFeed(
  options: UseFollowerEventsFeedOptions = {},
): UseFollowerEventsFeedResult {
  const { kinds } = options
  const { did } = useAuth()
  const {
    authors,
    isOversized,
    truncatedBySource,
    isLoading: authorsLoading,
    error: authorsError,
  } = useHomeFeedAuthors(did)

  const [events, setEvents] = useState<HydratedFeedEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<FollowerEventsErrorCode | null>(
    null,
  )
  const [hasMore, setHasMore] = useState(false)

  const endCursorRef = useRef<string | null>(null)
  const isLoadingMoreRef = useRef(false)

  // Primitive deps key so the initial-load effect doesn't refire on
  // every render that produces a new authors array identity.
  const authorsKey = authors.join(",")
  const kindsKey = kinds && kinds.length > 0 ? kinds.slice().sort().join(",") : ""
  const filterKey = `${authorsKey}|${kindsKey}`

  // Snapshot the latest authors / kinds so callbacks (loadMore, refresh)
  // see fresh values without listing them in their deps.
  const authorsRef = useRef(authors)
  authorsRef.current = authors
  const kindsRef = useRef(kinds)
  kindsRef.current = kinds

  // Filter key snapshot. loadMore and refresh capture this at call
  // time and skip their setState if the key has rolled (a key change
  // would otherwise splice stale page-N events into a fresh page-1).
  const filterKeyRef = useRef(filterKey)
  filterKeyRef.current = filterKey

  const loadInitial = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoading(true)
        setError(null)
        setErrorCode(null)
        // No signed-in user, or signed-in user follows nobody — skip
        // the round-trip. The UI shows the appropriate empty state.
        if (authorsRef.current.length === 0) {
          setEvents([])
          endCursorRef.current = null
          setHasMore(false)
          return
        }
        const page = await fetchFollowerEvents({
          authors: authorsRef.current,
          first: DEFAULT_FEED_PAGE_SIZE,
          kinds: kindsRef.current,
          signal,
        })
        if (signal?.aborted) return
        const hydrated = await hydrateFeedEvents(page.events, signal)
        if (signal?.aborted) return
        setEvents(hydrated)
        endCursorRef.current = page.endCursor
        setHasMore(page.hasNextPage)
      } catch (err) {
        if (signal?.aborted) return
        if (err instanceof FollowerEventsError) {
          setError(err.message)
          setErrorCode(err.code)
        } else {
          setError(err instanceof Error ? err.message : "Failed to load feed")
          setErrorCode(null)
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [],
  )

  // Initial load + reload on filter-key change. Cleanup aborts the
  // in-flight initial fetch AND resets the pagination cursor so a
  // late loadMore from the old key can't reuse a stale cursor against
  // the new author set.
  useEffect(() => {
    const controller = new AbortController()
    loadInitial(controller.signal)
    return () => {
      controller.abort()
      endCursorRef.current = null
    }
  }, [filterKey, loadInitial])

  const loadMore = useCallback(() => {
    if (!endCursorRef.current || isLoadingMoreRef.current) return
    if (authorsRef.current.length === 0) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    // Snapshot the key at call time. If the user's follow set changes
    // mid-request, we drop the result rather than splicing it onto a
    // fresh page-1 from the new author set.
    const dispatchedKey = filterKeyRef.current
    ;(async () => {
      try {
        const page = await fetchFollowerEvents({
          authors: authorsRef.current,
          first: DEFAULT_FEED_PAGE_SIZE,
          after: endCursorRef.current ?? undefined,
          kinds: kindsRef.current,
        })
        if (dispatchedKey !== filterKeyRef.current) return
        const hydrated = await hydrateFeedEvents(page.events)
        if (dispatchedKey !== filterKeyRef.current) return
        setEvents((prev) => {
          // Dedupe by event.id in case the server returns an overlapping
          // page (race between concurrent refresh + loadMore).
          const seen = new Set(prev.map((h) => h.event.id))
          const fresh = hydrated.filter((h) => !seen.has(h.event.id))
          return [...prev, ...fresh]
        })
        endCursorRef.current = page.endCursor
        setHasMore(page.hasNextPage)
      } catch (err) {
        if (dispatchedKey !== filterKeyRef.current) return
        // Loading-more errors stop pagination but don't replace the
        // existing list — the visible page stays valid.
        console.warn("[useFollowerEventsFeed] loadMore failed:", err)
        setHasMore(false)
      } finally {
        isLoadingMoreRef.current = false
        setIsLoadingMore(false)
      }
    })()
  }, [])

  const refresh = useCallback(async () => {
    if (authorsRef.current.length === 0) return
    const dispatchedKey = filterKeyRef.current
    try {
      const page = await fetchFollowerEvents({
        authors: authorsRef.current,
        first: DEFAULT_FEED_PAGE_SIZE,
        kinds: kindsRef.current,
      })
      if (dispatchedKey !== filterKeyRef.current) return
      const hydrated = await hydrateFeedEvents(page.events)
      if (dispatchedKey !== filterKeyRef.current) return
      setEvents((prev) => {
        // Merge by event.id: prepend new events that aren't already
        // in the list. Existing events keep their position so the
        // user's load-more history survives.
        const existingIds = new Set(prev.map((h) => h.event.id))
        const incoming = hydrated.filter((h) => !existingIds.has(h.event.id))
        if (incoming.length === 0) return prev
        return [...incoming, ...prev]
      })
      // Don't touch endCursorRef — the cursor we have is still valid
      // for the next page beyond what was previously loaded.
    } catch (err) {
      // Background poll failures are non-fatal — keep the visible
      // list, surface no error UI for poll-driven refresh.
      console.warn("[useFollowerEventsFeed] refresh failed:", err)
    }
  }, [])

  // Polling with visibility-aware cadence. Snapshot refresh in a ref
  // so the effect doesn't tear down when the callback identity
  // changes (it doesn't, today — useCallback with [] — but the ref
  // keeps that invariant from sneaking up later).
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  const hasAuthors = authors.length > 0
  useEffect(() => {
    if (!hasAuthors) return
    if (typeof window === "undefined") return

    let intervalId: ReturnType<typeof setInterval> | null = null

    const currentInterval = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? BACKGROUND_POLL_MS
        : FOREGROUND_POLL_MS

    const start = () => {
      if (intervalId !== null) clearInterval(intervalId)
      intervalId = setInterval(() => {
        void refreshRef.current()
      }, currentInterval())
    }

    const handleVisibility = () => {
      // Cadence changes when visibility flips. Restart the interval
      // immediately so we don't wait the previous (potentially long)
      // cadence to apply the new one.
      start()
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        // Fresh page-1 fetch on tab-focus, so a user returning to the
        // tab sees latest events without waiting for the next tick.
        void refreshRef.current()
      }
    }

    start()
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      if (intervalId !== null) clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [hasAuthors])

  const combinedIsLoading = isLoading || authorsLoading
  const combinedError = useMemo(
    () => error ?? authorsError ?? null,
    [error, authorsError],
  )

  return {
    events,
    authorsCount: authors.length,
    isLoading: combinedIsLoading,
    isLoadingMore,
    error: combinedError,
    errorCode,
    hasMore,
    isOversized,
    truncatedBySource,
    loadMore,
    refresh,
  }
}
