import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests against the indexer proxy's request-handling surface — the
 * trust boundary between the client and the upstream GraphQL endpoint.
 *
 * Approach: mock `fetch` so we don't hit the real indexer, and mock
 * `checkCsrf` to always allow (CSRF is exercised in its own suite).
 * Build NextRequest instances locally and assert on what the route
 * does with the request body vs. what it forwards upstream.
 */

vi.mock("@/lib/auth/csrf", () => ({
  checkCsrf: () => null,
}))

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
  // Default upstream response — happy GraphQL. Use an implementation
  // (not mockResolvedValue) so each call gets a FRESH Response —
  // Response bodies are streams and can only be read once, so a
  // single shared instance breaks after the first await .text().
  mockFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  )
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

async function postIndexer(body: unknown): Promise<Response> {
  const { POST } = await import("../route")
  const req = new Request("http://localhost/api/indexer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
  // The route reads from NextRequest; in practice Request is structurally
  // compatible for the methods this route uses (.text(), .headers, .signal).
  return POST(req as unknown as Parameters<typeof POST>[0])
}

describe("/api/indexer trust boundary", () => {
  describe("operation allowlist", () => {
    it("rejects an unknown operationName with 400", async () => {
      const res = await postIndexer({
        operationName: "arbitraryQuery",
        variables: { x: 1 },
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe("Unknown operation")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("rejects a mutation operationName even if it looks similar", async () => {
      const res = await postIndexer({
        operationName: "mutationActivities",
        variables: {},
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("rejects Object.prototype keys with 400 (own-key allowlist check)", async () => {
      // OPERATIONS is a plain object literal — without the
      // Object.hasOwn guard, inherited members (`constructor`,
      // `toString`, …) are truthy and would slip past the first gate.
      for (const op of ["constructor", "toString", "hasOwnProperty"]) {
        mockFetch.mockClear()
        const res = await postIndexer({ operationName: op, variables: {} })
        expect(res.status, `op=${op}`).toBe(400)
        const body = await res.json()
        expect(body.error, `op=${op}`).toBe("Unknown operation")
        expect(mockFetch).not.toHaveBeenCalled()
      }
    })

    it("rejects missing operationName with 400", async () => {
      const res = await postIndexer({ variables: { first: 10 } })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe("operationName is required")
    })

    it("rejects non-string operationName with 400", async () => {
      const res = await postIndexer({
        operationName: { malicious: true },
        variables: {},
      })
      expect(res.status).toBe(400)
    })

    it("accepts each allowlisted operation", async () => {
      const allowlisted = [
        ["Activities", {}],
        ["AuthoredActivities", { did: "did:plc:abc" }],
        ["ContributedActivities", { did: "did:plc:abc" }],
        ["Followers", { did: "did:plc:abc" }],
        ["ReceivedEndorsements", { did: "did:plc:abc" }],
        ["EndorsementDefs", { dids: ["did:plc:abc"] }],
      ] as const
      for (const [op, vars] of allowlisted) {
        mockFetch.mockClear()
        const res = await postIndexer({ operationName: op, variables: vars })
        expect(res.status, `op=${op}`).toBe(200)
        expect(mockFetch, `op=${op}`).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe("variable validation", () => {
    it("rejects an invalid did (no `did:` prefix)", async () => {
      const res = await postIndexer({
        operationName: "Followers",
        variables: { did: "not-a-did" },
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe("Invalid variables for operation")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("rejects EndorsementDefs with non-array dids", async () => {
      const res = await postIndexer({
        operationName: "EndorsementDefs",
        variables: { dids: "did:plc:abc" },
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("rejects EndorsementDefs with empty dids array", async () => {
      const res = await postIndexer({
        operationName: "EndorsementDefs",
        variables: { dids: [] },
      })
      expect(res.status).toBe(400)
    })

    it("EndorsementDefs filters out non-DID entries silently (fail-soft)", async () => {
      // Per #73: a single malformed DID in the input shouldn't reject
      // the whole batch — the indexed data isn't fully under our
      // control. readDidList now drops bad entries and forwards only
      // valid DIDs. Returns 400 only when *nothing* valid remains
      // (covered by the "empty dids array" test above).
      const res = await postIndexer({
        operationName: "EndorsementDefs",
        variables: { dids: ["did:plc:ok", "not-a-did"] },
      })
      expect(res.status).toBe(200)
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      // Bad entry filtered out; good entry forwarded.
      expect(body.variables.dids).toEqual(["did:plc:ok"])
    })

    it("rejects EndorsementDefs when every entry is a non-DID", async () => {
      const res = await postIndexer({
        operationName: "EndorsementDefs",
        variables: { dids: ["not-a-did", "still-not-a-did"] },
      })
      expect(res.status).toBe(400)
    })

    it("clamps `first` above MAX_FIRST (100) to 100", async () => {
      await postIndexer({
        operationName: "Activities",
        variables: { first: 100000 },
      })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.variables.first).toBe(100)
    })

    it("clamps `first` below 1 to 1", async () => {
      await postIndexer({
        operationName: "Activities",
        variables: { first: -5 },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.first).toBe(1)
    })

    it("falls back to default first when non-numeric", async () => {
      await postIndexer({
        operationName: "Activities",
        variables: { first: "twenty" },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.first).toBe(20)
    })

    it("EndorsementDefs uses its higher MAX_FIRST_DEFINITIONS cap (1000)", async () => {
      await postIndexer({
        operationName: "EndorsementDefs",
        variables: { dids: ["did:plc:a"], first: 100000 },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.first).toBe(1000)
    })

    it("strips overly-long `search` strings to null", async () => {
      const longSearch = "x".repeat(10_000)
      await postIndexer({
        operationName: "Activities",
        variables: { search: longSearch },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.search).toBeNull()
    })

    it("strips overly-long `after` cursor to null", async () => {
      await postIndexer({
        operationName: "Activities",
        variables: { after: "x".repeat(2000) },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.after).toBeNull()
    })

    it("rejects non-string `labels` array entries", async () => {
      await postIndexer({
        operationName: "Activities",
        variables: { labels: ["ok", 42] },
      })
      // The bad array drops to `null` (no filter) rather than 400 —
      // this matches the route's permissive optional-vars policy.
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.labels).toBeNull()
    })

    it("forwards an empty `authors` array as `[]` (explicit match-nothing)", async () => {
      await postIndexer({
        operationName: "Activities",
        variables: { authors: [] },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.authors).toEqual([])
    })

    it("forwards missing `authors` as `null` (no filter)", async () => {
      await postIndexer({
        operationName: "Activities",
        variables: {},
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.authors).toBeNull()
    })

    it("forwards a non-DID `authors` entry as `null` (no filter, not 400)", async () => {
      await postIndexer({
        operationName: "Activities",
        variables: { authors: ["did:plc:a", "not-a-did"] },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.authors).toBeNull()
    })
  })

  describe("body parsing + size limits", () => {
    it("returns 400 on invalid JSON", async () => {
      const res = await postIndexer("not json")
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe("Invalid JSON")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("returns 413 when body length > MAX_BODY_SIZE", async () => {
      const huge = JSON.stringify({
        operationName: "Activities",
        variables: { search: "x".repeat(40_000) },
      })
      const res = await postIndexer(huge)
      expect(res.status).toBe(413)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("returns 413 when UTF-8 byte size exceeds MAX_BODY_SIZE despite a smaller UTF-16 length", async () => {
      // quality-017: the cap is documented as 32KB *bytes*, but the
      // post-read check used `text.length` (UTF-16 code units). A body
      // of multi-byte characters can stay under 32768 code units while
      // carrying ~3x that many bytes. Each "あ" is 1 UTF-16 unit but 3
      // UTF-8 bytes, so this body is ~11KB by `.length` but ~33KB on
      // the wire — over the cap. No Content-Length header is set here
      // (the helper builds a Request whose body is a stream), so the
      // pre-read header check is skipped and this exercises the
      // post-read byte check directly.
      const multibyte = "あ".repeat(11_000)
      const body = JSON.stringify({
        operationName: "Activities",
        variables: { search: multibyte },
      })
      expect(body.length).toBeLessThan(32 * 1024)
      expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(32 * 1024)
      const res = await postIndexer(body)
      expect(res.status).toBe(413)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("upstream forwarding", () => {
    it("forwards the server-held query string for the requested operation", async () => {
      await postIndexer({
        operationName: "Followers",
        variables: { did: "did:plc:abc", first: 50 },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.operationName).toBe("Followers")
      expect(body.query).toContain("query Followers")
      expect(body.query).toContain("appCertifiedGraphFollow")
      expect(body.variables.did).toBe("did:plc:abc")
      expect(body.variables.first).toBe(50)
    })

    it("does NOT forward any client-supplied `query` field", async () => {
      await postIndexer({
        operationName: "Activities",
        variables: { first: 10 },
        // Client tries to smuggle a mutation in the body. Route ignores
        // anything outside operationName + variables.
        query: "mutation { hijack }",
      } as unknown as Record<string, unknown>)
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.query).not.toContain("mutation")
      expect(body.query).toContain("query Activities")
    })

    it("preserves upstream status code on the response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: [{ message: "schema error" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      const res = await postIndexer({
        operationName: "Activities",
        variables: {},
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.errors).toBeDefined()
    })
  })

  // ----- EndorsementClosure operation (issue #84 + magic-indexer #117) ------
  //
  // The proxy is the trust boundary for the new endorsement-graph
  // closure operation: it validates `viewer` is a DID and `degree`
  // is ∈ {1, 2, 3} before forwarding. Catching invalid input here
  // means a malformed inbound query 400s at the proxy without
  // burning a downstream round-trip — same shape as the existing
  // EndorsementDefs / ReceivedEndorsements gates.

  describe("EndorsementClosure validation", () => {
    it("forwards a well-formed request", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              endorsementClosure: { accounts: [], truncated: false },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      const res = await postIndexer({
        operationName: "EndorsementClosure",
        variables: { viewer: "did:plc:alice", degree: 2 },
      })
      expect(res.status).toBe(200)
      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string,
      )
      expect(body.variables).toEqual({ viewer: "did:plc:alice", degree: 2 })
      expect(body.query).toContain("query EndorsementClosure")
      // Inline issuer block (magic-indexer #117 perf follow-up) —
      // a single closure call carries every account's
      // displayName / handle / avatarCid so the client doesn't
      // need to paginate the appCertifiedActorProfile connection.
      expect(body.query).toContain("issuer")
      expect(body.query).toContain("avatarCid")
    })

    it("400s when viewer is missing", async () => {
      const res = await postIndexer({
        operationName: "EndorsementClosure",
        variables: { degree: 1 },
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("400s when viewer is not a DID", async () => {
      const res = await postIndexer({
        operationName: "EndorsementClosure",
        variables: { viewer: "not-a-did", degree: 1 },
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("400s when degree is out of range", async () => {
      for (const degree of [0, 4, -1, 99]) {
        mockFetch.mockClear()
        const res = await postIndexer({
          operationName: "EndorsementClosure",
          variables: { viewer: "did:plc:alice", degree },
        })
        expect(res.status).toBe(400)
        expect(mockFetch).not.toHaveBeenCalled()
      }
    })

    it("400s when degree is not an integer", async () => {
      const res = await postIndexer({
        operationName: "EndorsementClosure",
        variables: { viewer: "did:plc:alice", degree: 2.5 },
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("FollowerEvents", () => {
    it("forwards a valid authors list", async () => {
      const res = await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a", "did:plc:b"], first: 10 },
      })
      expect(res.status).toBe(200)
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.authors).toEqual(["did:plc:a", "did:plc:b"])
      expect(body.variables.first).toBe(10)
      expect(body.variables.kinds).toBeNull()
    })

    it("accepts an empty authors array (load-bearing — server returns empty)", async () => {
      const res = await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: [] },
      })
      expect(res.status).toBe(200)
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.authors).toEqual([])
    })

    it("400s when authors is missing", async () => {
      const res = await postIndexer({
        operationName: "FollowerEvents",
        variables: {},
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("400s when authors is not an array", async () => {
      const res = await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: "did:plc:a" },
      })
      expect(res.status).toBe(400)
    })

    it("400s when authors exceeds MAX_AUTHORS_FILTER_SIZE (500)", async () => {
      const tooMany = Array.from({ length: 501 }, (_, i) => `did:plc:x${i}`)
      const res = await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: tooMany },
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("clamps first above 50 to 50 (MAX_FEED_PAGE_SIZE)", async () => {
      await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a"], first: 999 },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.first).toBe(50)
    })

    it("forwards a valid kinds inclusion filter", async () => {
      await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a"], kinds: ["cert.create"] },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.kinds).toEqual(["cert.create"])
    })

    it("400s on non-string kind entries", async () => {
      const res = await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a"], kinds: ["ok", 42] },
      })
      expect(res.status).toBe(400)
    })

    it("treats empty kinds array as no-filter (null)", async () => {
      await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a"], kinds: [] },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.kinds).toBeNull()
    })

    it("fail-soft filters non-DID author entries (matches readDidList policy)", async () => {
      await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:ok", "not-a-did", "did:plc:also-ok"] },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.authors).toEqual(["did:plc:ok", "did:plc:also-ok"])
    })

    it("forwards sortBy=SORT_AT", async () => {
      await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a"], sortBy: "SORT_AT" },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.sortBy).toBe("SORT_AT")
    })

    it("forwards sortBy=CREATED_AT", async () => {
      await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a"], sortBy: "CREATED_AT" },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.sortBy).toBe("CREATED_AT")
    })

    it("drops unknown sortBy values to null (allowlist enforcement)", async () => {
      await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a"], sortBy: "INJECTED_VALUE" },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.sortBy).toBeNull()
    })

    it("drops non-string sortBy to null", async () => {
      await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a"], sortBy: 42 },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.sortBy).toBeNull()
    })

    it("treats missing sortBy as null (server falls back to its default)", async () => {
      await postIndexer({
        operationName: "FollowerEvents",
        variables: { authors: ["did:plc:a"] },
      })
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.sortBy).toBeNull()
    })
  })

  describe("CollectionsByUris", () => {
    it("forwards a valid uri batch against the collections connection", async () => {
      const uris = [
        "at://did:plc:a/org.hypercerts.collection/one",
        "at://did:plc:b/org.hypercerts.collection/two",
      ]
      const res = await postIndexer({
        operationName: "CollectionsByUris",
        variables: { uris },
      })
      expect(res.status).toBe(200)
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.operationName).toBe("CollectionsByUris")
      expect(body.query).toContain("query CollectionsByUris")
      expect(body.query).toContain("orgHypercertsCollection")
      expect(body.variables).toEqual({ uris })
    })

    it("400s on an empty uris array (callers skip the call instead)", async () => {
      const res = await postIndexer({
        operationName: "CollectionsByUris",
        variables: { uris: [] },
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("400s on non-at:// entries", async () => {
      const res = await postIndexer({
        operationName: "CollectionsByUris",
        variables: { uris: ["https://example.com/x"] },
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("400s when the batch exceeds MAX_URI_LIST_PER_KIND (50)", async () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => `at://did:plc:a/c/${i}`)
      const res = await postIndexer({
        operationName: "CollectionsByUris",
        variables: { uris: tooMany },
      })
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("HydrateFeedPage", () => {
    const allEmpty = {
      activityUris: [],
      collectionUris: [],
      badgeAwardUris: [],
      evaluationUris: [],
      measurementUris: [],
      hyperboardUris: [],
      attachmentUris: [],
    }

    it("forwards a mixed-kind page", async () => {
      const res = await postIndexer({
        operationName: "HydrateFeedPage",
        variables: {
          ...allEmpty,
          activityUris: ["at://did:plc:a/org.hypercerts.claim.activity/abc"],
          collectionUris: ["at://did:plc:b/org.hypercerts.collection/def"],
          evaluationUris: ["at://did:plc:c/org.hypercerts.context.evaluation/e"],
          hyperboardUris: ["at://did:plc:d/org.hyperboards.board/h"],
        },
      })
      expect(res.status).toBe(200)
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.activityUris).toHaveLength(1)
      expect(body.variables.collectionUris).toHaveLength(1)
      expect(body.variables.evaluationUris).toHaveLength(1)
      expect(body.variables.hyperboardUris).toHaveLength(1)
      expect(body.variables.badgeAwardUris).toEqual([])
      expect(body.variables.attachmentUris).toEqual([])
    })

    it("400s when any *Uris is missing (not an array)", async () => {
      const res = await postIndexer({
        operationName: "HydrateFeedPage",
        variables: {
          activityUris: ["at://x"],
          collectionUris: ["at://y"],
          badgeAwardUris: [],
          // other buckets omitted
        },
      })
      expect(res.status).toBe(400)
    })

    it("400s when one of the new-kind *Uris is missing", async () => {
      const res = await postIndexer({
        operationName: "HydrateFeedPage",
        variables: {
          activityUris: [],
          collectionUris: [],
          badgeAwardUris: [],
          evaluationUris: [],
          measurementUris: [],
          hyperboardUris: [],
          // attachmentUris omitted — the new buckets are required too
        },
      })
      expect(res.status).toBe(400)
    })

    it("400s when a *Uris exceeds MAX_URI_LIST_PER_KIND (50)", async () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => `at://x/${i}`)
      const res = await postIndexer({
        operationName: "HydrateFeedPage",
        variables: { ...allEmpty, activityUris: tooMany },
      })
      expect(res.status).toBe(400)
    })

    it("400s on non-string URI entries", async () => {
      const res = await postIndexer({
        operationName: "HydrateFeedPage",
        variables: { ...allEmpty, activityUris: ["ok", 42] },
      })
      expect(res.status).toBe(400)
    })
  })
})
