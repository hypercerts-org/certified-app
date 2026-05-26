import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"

/**
 * Integration coverage for `useFollowerEventsFeed`. We mock the upstream hooks
 * and the GraphQL client, then exercise the public API. The pure
 * orchestration logic (page merging by id, dedupe on overlap) is
 * the load-bearing surface here — polling cadence + visibility
 * handling is React-effect-bound and is intentionally left to manual
 * smoke for v1 (tracked in `06-deferred.md`).
 */

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    did: "did:plc:viewer",
    isLoading: false,
    isAuthenticated: true,
  }),
}))

vi.mock("@/hooks/use-home-feed-authors", () => ({
  useHomeFeedAuthors: () => ({
    authors: ["did:plc:a", "did:plc:b"],
    isOversized: false,
    truncatedBySource: false,
    isLoading: false,
    error: null,
  }),
}))

const fetchFollowerEventsMock = vi.fn()
const hydrateFeedEventsMock = vi.fn()

vi.mock("@/lib/atproto/follower-events", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/atproto/follower-events")
  >("@/lib/atproto/follower-events")
  return {
    ...actual,
    fetchFollowerEvents: (...args: unknown[]) => fetchFollowerEventsMock(...args),
    hydrateFeedEvents: (...args: unknown[]) => hydrateFeedEventsMock(...args),
  }
})

import { useFollowerEventsFeed } from "../use-follower-events-feed"

beforeEach(() => {
  fetchFollowerEventsMock.mockReset()
  hydrateFeedEventsMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

function makeEvent(id: string, sortAt = "2026-05-26T00:00:00.000Z") {
  return {
    event: {
      id,
      kind: "cert.create",
      subjectUri: id,
      sortAt,
      actor: {
        did: "did:plc:author",
        handle: "x.test",
        displayName: "X",
        avatarCid: null,
        pds: null,
      },
    },
    payload: null,
  }
}

describe("useFollowerEventsFeed", () => {
  it("populates events on initial load", async () => {
    fetchFollowerEventsMock.mockResolvedValueOnce({
      events: [{ id: "at://1" }, { id: "at://2" }],
      endCursor: "c1",
      hasNextPage: true,
    })
    hydrateFeedEventsMock.mockResolvedValueOnce([makeEvent("at://1"), makeEvent("at://2")])

    const { result } = renderHook(() => useFollowerEventsFeed())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.events.map((h) => h.event.id)).toEqual([
      "at://1",
      "at://2",
    ])
    expect(result.current.hasMore).toBe(true)
  })

  it("appends new events on loadMore, deduping overlap", async () => {
    fetchFollowerEventsMock
      .mockResolvedValueOnce({
        events: [{ id: "at://1" }, { id: "at://2" }],
        endCursor: "c1",
        hasNextPage: true,
      })
      .mockResolvedValueOnce({
        // Second page returns one overlap + one new event.
        events: [{ id: "at://2" }, { id: "at://3" }],
        endCursor: "c2",
        hasNextPage: false,
      })
    hydrateFeedEventsMock
      .mockResolvedValueOnce([makeEvent("at://1"), makeEvent("at://2")])
      .mockResolvedValueOnce([makeEvent("at://2"), makeEvent("at://3")])

    const { result } = renderHook(() => useFollowerEventsFeed())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.loadMore()
    })
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false))

    expect(result.current.events.map((h) => h.event.id)).toEqual([
      "at://1",
      "at://2",
      "at://3",
    ])
    expect(result.current.hasMore).toBe(false)
  })

  it("merges by event.id on refresh — prepends new, keeps existing positions", async () => {
    fetchFollowerEventsMock
      .mockResolvedValueOnce({
        events: [{ id: "at://1" }, { id: "at://2" }],
        endCursor: "c1",
        hasNextPage: true,
      })
      .mockResolvedValueOnce({
        // Refresh sees a brand-new event (at://0) plus existing at://1.
        events: [{ id: "at://0" }, { id: "at://1" }],
        endCursor: "c1-fresh",
        hasNextPage: true,
      })
    hydrateFeedEventsMock
      .mockResolvedValueOnce([makeEvent("at://1"), makeEvent("at://2")])
      .mockResolvedValueOnce([makeEvent("at://0"), makeEvent("at://1")])

    const { result } = renderHook(() => useFollowerEventsFeed())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.events.map((h) => h.event.id)).toEqual([
      "at://0",
      "at://1",
      "at://2",
    ])
  })

  it("maps FollowerEventsError to errorCode", async () => {
    const { FollowerEventsError } = await import(
      "@/lib/atproto/follower-events"
    )
    fetchFollowerEventsMock.mockRejectedValueOnce(
      new FollowerEventsError("too many", "AUTHORS_FILTER_TOO_LARGE"),
    )

    const { result } = renderHook(() => useFollowerEventsFeed())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.errorCode).toBe("AUTHORS_FILTER_TOO_LARGE")
    expect(result.current.error).toBe("too many")
  })
})
