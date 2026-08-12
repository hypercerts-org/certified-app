import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, cleanup } from "@testing-library/react"

/**
 * The graph loader (a) pages the AllEndorsements indexer op via GET with
 * the operation variables as query params, and (b) resolves participant
 * profiles in PARALLEL 100-DID chunks — a multi-hundred-participant
 * network must not pay one sequential round-trip per chunk.
 *
 * The hook keeps a module-level cache, so each test re-imports a fresh
 * module via vi.resetModules().
 */

interface ActorLite {
  did: string
  displayName: string | null
  avatarUrl: string | null
}

/** Pending fetchNetworkActorsByDids calls, resolved manually per test. */
let actorCalls: { dids: string[]; resolve: (actors: ActorLite[]) => void }[] = []

vi.mock("@/lib/atproto/workspace", () => ({
  fetchNetworkActorsByDids: (dids: string[]) =>
    new Promise<ActorLite[]>((resolve) => {
      actorCalls.push({ dids, resolve })
    }),
}))

vi.mock("@/lib/atproto/resolve-did-batch", () => ({
  loadResolvedProfile: async () => null,
}))

// 120 endorsements between disjoint pairs -> 240 participant DIDs -> two
// scan pages (PAGE_SIZE 100) and three profile chunks (PROFILE_CHUNK 100).
const EDGE_COUNT = 120

function edgeNode(n: number) {
  return {
    uri: `at://did:plc:i${n}/app.certified.badge.award/e${n}`,
    did: `did:plc:i${n}`,
    subject: { did: `did:plc:s${n}` },
  }
}

let fetchCalls: { url: string; init: RequestInit | undefined }[] = []

function stubIndexerFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      fetchCalls.push({ url, init })
      const u = new URL(url, "http://localhost")
      const badgeType = u.searchParams.get("badgeType")
      const after = u.searchParams.get("after")
      let edges: { node: ReturnType<typeof edgeNode> }[] = []
      let pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
        hasNextPage: false,
        endCursor: null,
      }
      if (badgeType === "endorsement") {
        if (!after) {
          edges = Array.from({ length: 100 }, (_, n) => ({ node: edgeNode(n) }))
          pageInfo = { hasNextPage: true, endCursor: "cursor-1" }
        } else if (after === "cursor-1") {
          edges = Array.from({ length: EDGE_COUNT - 100 }, (_, n) => ({
            node: edgeNode(100 + n),
          }))
        }
      }
      return {
        ok: true,
        json: async () => ({ data: { appCertifiedBadgeAward: { edges, pageInfo } } }),
      }
    }),
  )
}

async function freshHook() {
  vi.resetModules()
  return (await import("../use-endorsement-graph")).useEndorsementGraph
}

beforeEach(() => {
  actorCalls = []
  fetchCalls = []
  stubIndexerFetch()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useEndorsementGraph — indexer GET contract", () => {
  it("pages AllEndorsements via GET with op/badgeType/first/after params", async () => {
    const useEndorsementGraph = await freshHook()
    renderHook(() => useEndorsementGraph())

    // Both scans page to completion: endorsement page 1 + page 2, award page 1.
    await waitFor(() => expect(fetchCalls).toHaveLength(3))

    const parsed = fetchCalls.map((c) => ({
      u: new URL(c.url, "http://localhost"),
      init: c.init,
    }))
    for (const { u, init } of parsed) {
      expect(u.pathname).toBe("/api/indexer")
      expect(u.searchParams.get("op")).toBe("AllEndorsements")
      expect(u.searchParams.get("first")).toBe("100")
      // GET with no body — the POST form is gone.
      expect(init?.method).toBeUndefined()
      expect(init?.body).toBeUndefined()
    }

    const endorsement = parsed.filter((p) => p.u.searchParams.get("badgeType") === "endorsement")
    const award = parsed.filter((p) => p.u.searchParams.get("badgeType") === "award")
    expect(endorsement).toHaveLength(2)
    expect(award).toHaveLength(1)
    // First page carries no cursor; the second carries the returned one.
    expect(endorsement.map((p) => p.u.searchParams.get("after")).sort()).toEqual([
      "cursor-1",
      null,
    ].sort())
    expect(award[0].u.searchParams.get("after")).toBeNull()
  })
})

describe("useEndorsementGraph — profile chunk resolution", () => {
  it("fetches all 100-DID chunks in parallel and merges them by DID", async () => {
    const useEndorsementGraph = await freshHook()
    const { result } = renderHook(() => useEndorsementGraph())

    // All three chunk calls must be in flight BEFORE any resolves — the
    // old serial loop would sit at one pending call and time out here.
    await waitFor(() => expect(actorCalls).toHaveLength(3))
    expect(actorCalls.map((c) => c.dids.length)).toEqual([100, 100, 40])

    for (const call of actorCalls) {
      call.resolve(
        call.dids.map((did) => ({ did, displayName: `Name ${did}`, avatarUrl: null })),
      )
    }

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const graph = result.current.graph
    expect(graph?.nodes).toHaveLength(EDGE_COUNT * 2)
    expect(graph?.links).toHaveLength(EDGE_COUNT)
    // Chunk results landed in the profile map regardless of chunk order.
    expect(graph?.nodes.find((n) => n.id === "did:plc:i0")?.displayName).toBe(
      "Name did:plc:i0",
    )
    expect(graph?.nodes.find((n) => n.id === "did:plc:s119")?.displayName).toBe(
      "Name did:plc:s119",
    )
  })
})
