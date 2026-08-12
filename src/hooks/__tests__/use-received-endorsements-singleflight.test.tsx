import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"

// On a cold profile visit the header, sidebar and overview all mount
// useReceivedEndorsements for the same DID in one commit. The module
// cache only stores settled scans, so without in-flight dedupe each
// instance used to launch its own full indexer page-walk (3x every
// POST /api/indexer page). The singleflight map must collapse them
// into ONE scan shared by every waiter.

const postIndexerMock = vi.fn()
vi.mock("@/lib/atproto/indexer", () => ({
  postIndexer: (...args: unknown[]) => postIndexerMock(...args),
}))

import { useReceivedEndorsements } from "../use-received-endorsements"

function awardPage(nodes: unknown[]): unknown {
  return {
    ok: true,
    status: 200,
    errors: [],
    data: {
      appCertifiedBadgeAward: {
        edges: nodes.map((node) => ({ node })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  }
}

beforeEach(() => {
  cleanup()
  postIndexerMock.mockReset()
})

describe("useReceivedEndorsements — in-flight singleflight", () => {
  it("three simultaneous mounts share one indexer scan", async () => {
    let resolvePage: (v: unknown) => void = () => {}
    postIndexerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve
        }),
    )

    // Unique DID — the module cache persists across tests in this file.
    const did = "did:plc:singleflight-recv"
    const h1 = renderHook(() => useReceivedEndorsements(did))
    const h2 = renderHook(() => useReceivedEndorsements(did))
    const h3 = renderHook(() => useReceivedEndorsements(did))

    // All three mounted against a cold cache, but only ONE scan runs.
    await waitFor(() => expect(postIndexerMock).toHaveBeenCalledTimes(1))
    expect(postIndexerMock.mock.calls[0][0]).toBe("ReceivedEndorsements")

    await act(async () => {
      resolvePage(
        awardPage([
          {
            uri: "at://did:plc:iss/app.certified.badge.award/a1",
            cid: "cid-a1",
            did: "did:plc:iss",
            createdAt: "2026-06-01T00:00:00.000Z",
            badge: null,
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(h1.result.current.isLoading).toBe(false)
      expect(h2.result.current.isLoading).toBe(false)
      expect(h3.result.current.isLoading).toBe(false)
    })
    expect(postIndexerMock).toHaveBeenCalledTimes(1)

    const uris = (r: typeof h1) =>
      r.result.current.endorsements.map((e) => e.uri)
    expect(uris(h1)).toEqual(["at://did:plc:iss/app.certified.badge.award/a1"])
    expect(uris(h2)).toEqual(uris(h1))
    expect(uris(h3)).toEqual(uris(h1))
  })

  it("one consumer unmounting mid-scan does not fail its siblings", async () => {
    let resolvePage: (v: unknown) => void = () => {}
    postIndexerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve
        }),
    )

    const did = "did:plc:singleflight-unmount"
    const h1 = renderHook(() => useReceivedEndorsements(did))
    const h2 = renderHook(() => useReceivedEndorsements(did))
    await waitFor(() => expect(postIndexerMock).toHaveBeenCalledTimes(1))

    // The shared scan is not bound to the unmounting caller's signal.
    h1.unmount()
    await act(async () => {
      resolvePage(awardPage([]))
    })

    await waitFor(() => expect(h2.result.current.isLoading).toBe(false))
    expect(h2.result.current.error).toBeNull()
    expect(h2.result.current.endorsements).toEqual([])
    expect(postIndexerMock).toHaveBeenCalledTimes(1)
  })
})
