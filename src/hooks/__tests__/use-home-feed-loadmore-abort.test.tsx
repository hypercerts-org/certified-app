import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"
import type {
  FeedEventPage,
  HydratedFeedEvent,
  FetchFollowerEventsOptions,
  HydrateFeedEventsOptions,
} from "@/lib/atproto/follower-events"

// Deferred mock of fetchFollowerEvents / hydrateFeedEvents. Each fetch
// records its args (crucially the AbortSignal) and returns a promise we
// settle by hand, so a test can toggle the filter between a loadMore
// fetch starting and resolving.
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
        _events: HydratedFeedEvent["event"][],
        _opts?: HydrateFeedEventsOptions,
      ) => [] as HydratedFeedEvent[],
    ),
  }
})

import { useHomeFeed } from "../use-home-feed"

function page(endCursor: string | null, hasNextPage: boolean): FeedEventPage {
  return { events: [], endCursor, hasNextPage }
}

beforeEach(() => {
  cleanup()
  fetchCalls.length = 0
})

describe("useHomeFeed — loadMore abort guard", () => {
  it("aborts an in-flight loadMore when the filter changes and drops its stale page", async () => {
    const followed = new Set(["did:a"])
    const { result, rerender } = renderHook(
      ({ exclude }: { exclude: string[] }) =>
        useHomeFeed(followed, { excludeCertLabels: exclude }),
      { initialProps: { exclude: ["draft"] } },
    )

    // Page 1 (initial load) — gives a cursor + hasMore so loadMore runs.
    await waitFor(() => expect(fetchCalls.length).toBe(1))
    await act(async () => {
      fetchCalls[0].resolve(page("cursor-1", true))
    })
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    expect(result.current.cursor).toBe("cursor-1")

    // loadMore → page-2 fetch (using the cursor), carrying its own signal.
    act(() => {
      result.current.loadMore()
    })
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.after === "cursor-1")).toBe(true),
    )
    const loadMoreFetch = fetchCalls.find((c) => c.after === "cursor-1")!
    expect(loadMoreFetch.signal).toBeDefined()
    expect(loadMoreFetch.signal!.aborted).toBe(false)

    // Toggle the quality filter mid-pagination. The effect re-runs; its
    // cleanup must abort the in-flight loadMore.
    rerender({ exclude: ["draft", "likely-test"] })
    expect(loadMoreFetch.signal!.aborted).toBe(true)

    // The fresh, re-filtered load() lands.
    await waitFor(() =>
      expect(fetchCalls.filter((c) => c.after === undefined).length).toBe(2),
    )
    const freshLoad = fetchCalls.filter((c) => c.after === undefined).at(-1)!
    await act(async () => {
      freshLoad.resolve(page("fresh-cursor", true))
    })
    await waitFor(() => expect(result.current.cursor).toBe("fresh-cursor"))

    // The stale loadMore resolves late with a page from the OLD filter.
    // Its success setState is guarded by `signal.aborted`, so it must NOT
    // overwrite the fresh cursor/hasMore.
    await act(async () => {
      loadMoreFetch.resolve(page("stale-cursor", false))
    })

    expect(result.current.cursor).toBe("fresh-cursor")
    expect(result.current.hasMore).toBe(true)
  })
})
