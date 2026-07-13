import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"

// useFollowers is mounted by the profile header, sidebar and follow
// button in the same commit. The cached-DID-resource factory must
// collapse those cold-cache mounts into one paginated indexer walk,
// and the walk's dedupe-by-follower must run inside the shared fetch
// so every waiter receives the deduped list.

const postIndexerMock = vi.fn()
vi.mock("@/lib/atproto/indexer", () => ({
  postIndexer: (...args: unknown[]) => postIndexerMock(...args),
}))

import { useFollowers } from "../use-followers"

function followPage(nodes: unknown[]): unknown {
  return {
    ok: true,
    status: 200,
    errors: [],
    data: {
      appCertifiedGraphFollow: {
        totalCount: nodes.length,
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

describe("useFollowers — shared walk + dedupe", () => {
  it("two simultaneous consumers share one walk; duplicate follow records collapse", async () => {
    let resolvePage: (v: unknown) => void = () => {}
    postIndexerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve
        }),
    )

    // Unique DID — the module cache persists across tests in this file.
    const did = "did:plc:followers-target"
    const a = renderHook(() => useFollowers(did))
    const b = renderHook(() => useFollowers(did))

    await waitFor(() => expect(postIndexerMock).toHaveBeenCalledTimes(1))
    expect(postIndexerMock.mock.calls[0][0]).toBe("Followers")

    await act(async () => {
      resolvePage(
        followPage([
          // alice followed twice (re-follow left the old record) — the
          // list must keep only her NEWEST record.
          { uri: "at://a/app.certified.graph.follow/1", cid: "c1", did: "did:plc:alice", createdAt: "2026-01-01T00:00:00.000Z" },
          { uri: "at://a/app.certified.graph.follow/2", cid: "c2", did: "did:plc:alice", createdAt: "2026-02-01T00:00:00.000Z" },
          { uri: "at://b/app.certified.graph.follow/3", cid: "c3", did: "did:plc:bob", createdAt: "2026-01-15T00:00:00.000Z" },
        ]),
      )
    })

    await waitFor(() => {
      expect(a.result.current.count).toBe(2)
      expect(b.result.current.count).toBe(2)
    })
    expect(postIndexerMock).toHaveBeenCalledTimes(1)

    // Newest-first, alice's kept entry is her most recent record.
    expect(a.result.current.entries.map((e) => e.cid)).toEqual(["c2", "c3"])
    expect(b.result.current.entries).toEqual(a.result.current.entries)
  })

  it("optimistic add/remove write through to the cache for re-mounts", async () => {
    postIndexerMock.mockImplementation(async () => followPage([]))

    const did = "did:plc:followers-optimistic"
    const first = renderHook(() => useFollowers(did))
    await waitFor(() => expect(first.result.current.count).toBe(0))

    act(() => {
      first.result.current.addFollower(
        "did:plc:carol",
        "at://c/app.certified.graph.follow/9",
        "c9",
      )
    })
    expect(first.result.current.count).toBe(1)
    first.unmount()

    // Re-mount inside the stale window: the optimistic entry survives
    // without a new fetch.
    const second = renderHook(() => useFollowers(did))
    await waitFor(() => expect(second.result.current.count).toBe(1))
    expect(postIndexerMock).toHaveBeenCalledTimes(1)

    act(() => {
      second.result.current.removeFollower("did:plc:carol")
    })
    expect(second.result.current.count).toBe(0)
  })
})
