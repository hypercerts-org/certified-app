import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"
import {
  FollowerEventsError,
  type FeedEventPage,
  type HydratedFeedEvent,
  type FetchFollowerEventsOptions,
  type HydrateFeedEventsOptions,
} from "@/lib/atproto/follower-events"

// Controllable mock of fetchFollowerEvents / hydrateFeedEvents. Each
// fetch call records its args (crucially the AbortSignal) and returns a
// deferred promise we settle by hand, so a test can unmount the hook
// between a fetch starting and resolving. FollowerEventsError is kept
// real (via importActual) so the hook's `instanceof` recovery branch
// fires for an INVALID_CURSOR rejection.
interface PendingFetch {
  after: string | undefined
  signal: AbortSignal | undefined
  resolve: (value: FeedEventPage) => void
  reject: (err: unknown) => void
}

const fetchCalls: PendingFetch[] = []

vi.mock("@/lib/atproto/follower-events", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/atproto/follower-events")
  >("@/lib/atproto/follower-events")
  return {
    ...actual,
    fetchFollowerEvents: vi.fn(
      (options: FetchFollowerEventsOptions) =>
        new Promise<FeedEventPage>((resolve, reject) => {
          fetchCalls.push({
            after: options.after,
            signal: options.signal,
            resolve,
            reject,
          })
        }),
    ),
    hydrateFeedEvents: vi.fn(
      async (
        events: HydratedFeedEvent["event"][],
        _opts?: HydrateFeedEventsOptions,
      ) =>
        // No events to hydrate in these fixtures — the mapping path is
        // not under test here; the recovery-controller lifecycle is.
        [] as HydratedFeedEvent[],
    ),
  }
})

import { useLegacyHomeFeed } from "../use-home-feed"

function page(endCursor: string | null, hasNextPage: boolean): FeedEventPage {
  return { events: [], endCursor, hasNextPage }
}

beforeEach(() => {
  cleanup()
  fetchCalls.length = 0
})

describe("useHomeFeed — INVALID_CURSOR recovery controller lifecycle", () => {
  it("aborts the recovery fetch when the hook unmounts mid-recovery", async () => {
    const followed = new Set(["did:a"])
    const { result, unmount } = renderHook(() => useLegacyHomeFeed(followed))

    // Page 1 (initial load) — gives us a cursor + hasMore so loadMore runs.
    await waitFor(() => expect(fetchCalls.length).toBe(1))
    await act(async () => {
      fetchCalls[0].resolve(page("cursor-1", true))
    })
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    expect(result.current.cursor).toBe("cursor-1")

    // loadMore → page-2 fetch (using the cursor).
    act(() => {
      result.current.loadMore()
    })
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.after === "cursor-1")).toBe(true),
    )

    // Page-2 fetch rejects with INVALID_CURSOR → triggers the recovery
    // load() from the head, which issues a fresh fetch.
    await act(async () => {
      const idx = fetchCalls.findIndex((c) => c.after === "cursor-1")
      fetchCalls[idx].reject(
        new FollowerEventsError("stale cursor", "INVALID_CURSOR"),
      )
    })

    // The recovery load() fires a from-the-head fetch (after === undefined,
    // and it's the one after the rejected page-2 call).
    await waitFor(() =>
      expect(
        fetchCalls.filter((c) => c.after === undefined).length,
      ).toBeGreaterThanOrEqual(2),
    )
    const recovery = fetchCalls.filter((c) => c.after === undefined).at(-1)!
    expect(recovery.signal).toBeDefined()
    // Pre-fix: the recovery controller is untracked, so its signal is
    // never aborted on unmount.
    expect(recovery.signal!.aborted).toBe(false)

    // Unmount mid-recovery. The fix stores the recovery controller in a
    // ref the effect cleanup aborts; pre-fix nothing aborts it.
    unmount()

    expect(recovery.signal!.aborted).toBe(true)
  })
})
