import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  CertifiedFeedPage,
  GetCertifiedFeedInput,
} from "@/lib/atproto/certified-feed"

interface Pending {
  input: GetCertifiedFeedInput
  signal: AbortSignal | undefined
  resolve: (page: CertifiedFeedPage) => void
  reject: (error: unknown) => void
}

const pending: Pending[] = []

vi.mock("@/lib/atproto/certified-feed", async () => {
  const actual = await vi.importActual<typeof import("@/lib/atproto/certified-feed")>(
    "@/lib/atproto/certified-feed",
  )
  return {
    ...actual,
    fetchCertifiedFeed: vi.fn(
      (input: GetCertifiedFeedInput, options?: { signal?: AbortSignal }) =>
        new Promise<CertifiedFeedPage>((resolve, reject) => {
          pending.push({ input, signal: options?.signal, resolve, reject })
        }),
    ),
  }
})

import { CertifiedFeedError } from "@/lib/atproto/certified-feed"
import { useHomeFeed } from "../use-home-feed"

const viewerA = "did:plc:abcdefghijklmnopqrstuvwx"
const viewerB = "did:plc:zyxwvutsrqponmlkjihgfedc"
const evaluatorC = "did:plc:qwertyuiopasdfghjklzxcvb"

function page(viewerDid: string, cursor: string | null, suffix = "a"): CertifiedFeedPage {
  const uri = `at://${viewerDid}/org.hypercerts.claim.activity/${suffix}`
  return {
    items: [
      {
        id: uri,
        kind: "cert.create",
        subject: { uri, cid: `cid-${suffix}` },
        feedTimestamp: "2026-07-21T10:00:00.000Z",
        actor: {
          did: viewerDid,
          handle: `${suffix}.example`,
          displayName: `Actor ${suffix}`,
          avatar: null,
        },
        view: {
          $type: "app.certified.feed.beta.defs#activityView",
          title: `Activity ${suffix}`,
          shortDescription: null,
          image: null,
          createdAt: "2026-07-21T10:00:00.000Z",
          startDate: null,
          endDate: null,
          locationCount: 0,
        },
      },
    ],
    cursor,
  }
}

const options = {
  trustedEvaluators: [viewerB],
  organizationQuality: {
    allowed: ["high-quality", "standard"] as const,
    includeUnrated: true,
  },
}

beforeEach(() => {
  cleanup()
  pending.length = 0
})

describe("useHomeFeed service lifecycle", () => {
  it("waits for evaluator readiness and sends viewer plus request filters", async () => {
    const { rerender } = renderHook(
      ({ ready }) => useHomeFeed(viewerA, { ...options, ready }),
      { initialProps: { ready: false } },
    )
    expect(pending).toHaveLength(0)
    rerender({ ready: true })
    await waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0].input).toMatchObject({
      viewerDid: viewerA,
      trustedEvaluators: [viewerB],
      organizationQuality: { allowed: ["high-quality", "standard"], includeUnrated: true },
      limit: 50,
    })
  })

  it("aborts an initial request and immediately masks its state when ownership changes", async () => {
    const { result, rerender } = renderHook(
      ({ viewer }) => useHomeFeed(viewer, options),
      { initialProps: { viewer: viewerA } },
    )
    await waitFor(() => expect(pending).toHaveLength(1))
    const staleInitial = pending[0]

    rerender({ viewer: viewerB })

    expect(result.current.requestKey).toContain(viewerB)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.events).toEqual([])
    expect(result.current.cursor).toBeNull()
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(staleInitial.signal?.aborted).toBe(true)
  })

  it("aborts stale initial and continuation requests when the viewer changes", async () => {
    const { result, rerender } = renderHook(
      ({ viewer }) => useHomeFeed(viewer, options),
      { initialProps: { viewer: viewerA } },
    )
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve(page(viewerA, "cursor-a")))
    await waitFor(() => expect(result.current.cursor).toBe("cursor-a"))
    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(2))
    const continuation = pending[1]

    rerender({ viewer: viewerB })
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(continuation.signal?.aborted).toBe(true)
    await act(async () => continuation.resolve(page(viewerA, null, "stale")))
    await act(async () => pending[2].resolve(page(viewerB, null, "fresh")))
    await waitFor(() => expect(result.current.events[0]?.actor).toBe(viewerB))
    expect(result.current.events.some((event) => event.uri.endsWith("/stale"))).toBe(false)
  })

  it("admits only one continuation request across same-tick loadMore calls", async () => {
    const { result } = renderHook(() => useHomeFeed(viewerA, options))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve(page(viewerA, "cursor-a")))
    await waitFor(() => expect(result.current.cursor).toBe("cursor-a"))

    act(() => {
      result.current.loadMore()
      result.current.loadMore()
    })

    expect(pending).toHaveLength(2)
    expect(pending[1].input.cursor).toBe("cursor-a")
  })

  it("aborts continuation on filter change without combining new input and old cursor", async () => {
    const { result, rerender } = renderHook(
      ({ evaluator }) =>
        useHomeFeed(viewerA, {
          ...options,
          trustedEvaluators: [evaluator],
        }),
      { initialProps: { evaluator: viewerB } },
    )
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve(page(viewerA, "cursor-a")))
    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(2))
    const staleContinuation = pending[1]

    rerender({ evaluator: evaluatorC })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.events).toEqual([])
    expect(result.current.cursor).toBeNull()
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(staleContinuation.signal?.aborted).toBe(true)
    expect(pending[2].input).toMatchObject({
      trustedEvaluators: [evaluatorC],
    })
    expect(pending[2].input.cursor).toBeUndefined()
  })

  it("continues safely from an empty page that still has a cursor", async () => {
    const { result } = renderHook(() => useHomeFeed(viewerA, options))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve({ items: [], cursor: "cursor-a" }))
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    expect(result.current.events).toEqual([])

    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].input.cursor).toBe("cursor-a")
    await act(async () => pending[1].resolve(page(viewerA, null, "visible")))
    await waitFor(() => expect(result.current.events[0]?.uri).toMatch(/visible$/))
  })

  it("stops repeated cursors and blocks automatic continuation", async () => {
    const { result } = renderHook(() => useHomeFeed(viewerA, options))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve(page(viewerA, "cursor-a")))
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => pending[1].resolve(page(viewerA, "cursor-a", "second")))
    await waitFor(() => expect(result.current.continuationError).toMatch(/repeated/))
    expect(result.current.canAutoLoad).toBe(false)
  })

  it("detects a multi-step cursor cycle before issuing another request", async () => {
    const { result } = renderHook(() => useHomeFeed(viewerA, options))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve(page(viewerA, "cursor-a", "first")))
    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => pending[1].resolve(page(viewerA, "cursor-b", "second")))
    await waitFor(() => expect(result.current.cursor).toBe("cursor-b"))

    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(3))
    await act(async () => pending[2].resolve(page(viewerA, "cursor-a", "third")))
    await waitFor(() => expect(result.current.continuationError).toMatch(/repeated/))
    expect(result.current.events.some((event) => event.uri.endsWith("/third"))).toBe(false)
    expect(pending).toHaveLength(3)
  })

  it("recovers InvalidCursor from page one and replaces stale visible items", async () => {
    const { result } = renderHook(() => useHomeFeed(viewerA, options))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve(page(viewerA, "cursor-a", "old")))
    await waitFor(() => expect(result.current.cursor).toBe("cursor-a"))
    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () =>
      pending[1].reject(new CertifiedFeedError("Discard cursor", 400, "InvalidCursor")),
    )
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(pending[2].input.cursor).toBeUndefined()
    await act(async () => pending[2].resolve(page(viewerA, null, "replacement")))
    await waitFor(() => expect(result.current.events[0]?.uri).toMatch(/replacement$/))
  })

  it("retries page one after invalid-cursor recovery itself fails", async () => {
    const { result } = renderHook(() => useHomeFeed(viewerA, options))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve(page(viewerA, "invalid-cursor", "old")))
    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () =>
      pending[1].reject(
        new CertifiedFeedError("Discard cursor", 400, "InvalidCursor"),
      ),
    )
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(pending[2].input.cursor).toBeUndefined()
    await act(async () =>
      pending[2].reject(new CertifiedFeedError("Recovery failed", 500, "InternalError")),
    )
    await waitFor(() => expect(result.current.continuationError).toBe("Recovery failed"))
    expect(result.current.cursor).toBeNull()
    expect(result.current.events[0]?.uri).toMatch(/old$/)

    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(4))
    expect(pending[3].input.cursor).toBeUndefined()
    await act(async () => pending[3].resolve(page(viewerA, null, "recovered")))
    await waitFor(() => expect(result.current.events[0]?.uri).toMatch(/recovered$/))
  })

  it("blocks an initial 429 retry until a visible delay expires", async () => {
    const { result } = renderHook(() => useHomeFeed(viewerA, options))
    await waitFor(() => expect(pending).toHaveLength(1))
    const retryAt = Date.now() + 60_000
    await act(async () =>
      pending[0].reject(new CertifiedFeedError("Rate limited", 429, null, retryAt)),
    )
    await waitFor(() => expect(result.current.error).toBe("Rate limited"))
    expect(result.current.retryAt).toBe(retryAt)
    act(() => result.current.retryInitial())
    expect(pending).toHaveLength(1)
  })

  it("keeps items after 429 and refuses retry before a visible delay expires", async () => {
    const { result } = renderHook(() => useHomeFeed(viewerA, options))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve(page(viewerA, "cursor-a")))
    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () =>
      pending[1].reject(
        new CertifiedFeedError("Rate limited", 429, null, Date.now() + 60_000),
      ),
    )
    await waitFor(() => expect(result.current.continuationError).toBe("Rate limited"))
    expect(result.current.events).toHaveLength(1)
    act(() => result.current.loadMore())
    expect(pending).toHaveLength(2)
  })

  it("admits manual continuation retry after its cooldown expires", async () => {
    const { result } = renderHook(() => useHomeFeed(viewerA, options))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve(page(viewerA, "cursor-a")))
    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () =>
      pending[1].reject(
        new CertifiedFeedError("Rate limited", 429, null, Date.now() + 10),
      ),
    )
    await waitFor(() => expect(result.current.continuationError).toBe("Rate limited"))
    act(() => result.current.loadMore())
    expect(pending).toHaveLength(2)

    await new Promise((resolve) => setTimeout(resolve, 20))
    act(() => result.current.loadMore())
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(pending[2].input.cursor).toBe("cursor-a")
  })
})
