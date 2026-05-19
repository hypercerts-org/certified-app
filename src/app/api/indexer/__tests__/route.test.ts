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
        ["LegacyEndorsements", { authors: ["did:plc:abc"] }],
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

    it("rejects EndorsementDefs with a non-DID in the dids array", async () => {
      const res = await postIndexer({
        operationName: "EndorsementDefs",
        variables: { dids: ["did:plc:ok", "not-a-did"] },
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
        variables: { search: "x".repeat(20_000) },
      })
      const res = await postIndexer(huge)
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
})
