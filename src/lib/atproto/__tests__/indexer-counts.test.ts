import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchNetworkCounts, INDEXER_PROXY_URL } from "../indexer"

/**
 * The five zero-variable network counts ride the proxy's edge-cacheable
 * GET variant (`GET /api/indexer?op=<name>` — CACHEABLE_OPS in
 * src/app/api/indexer/route.ts) instead of POST: the response body is
 * identical by contract, but GETs are cacheable at the Vercel edge so
 * the /welcome stats strip stops invoking the function per visitor.
 */

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  globalThis.fetch = originalFetch
  warnSpy.mockRestore()
})

const OP_ROOTS: Record<string, string> = {
  ProfileCount: "appCertifiedActorProfile",
  OrganizationCount: "appCertifiedActorOrganization",
  ActivityCount: "orgHypercertsClaimActivity",
  ProjectCount: "orgHypercertsCollection",
  AwardCount: "appCertifiedBadgeAward",
}

function opFromCall(call: unknown[]): string {
  const url = new URL(String(call[0]), "http://localhost")
  return url.searchParams.get("op") ?? ""
}

describe("fetchNetworkCounts", () => {
  it("issues one GET per count op with the op in the query string (no POST body)", async () => {
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), "http://localhost")
      const root = OP_ROOTS[url.searchParams.get("op") ?? ""]
      return new Response(
        JSON.stringify({ data: { [root]: { totalCount: 42 } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })

    const counts = await fetchNetworkCounts()

    expect(mockFetch).toHaveBeenCalledTimes(5)
    const ops = mockFetch.mock.calls.map(opFromCall).sort()
    expect(ops).toEqual(
      Object.keys(OP_ROOTS).sort(),
    )
    for (const call of mockFetch.mock.calls) {
      expect(String(call[0])).toMatch(
        new RegExp(`^${INDEXER_PROXY_URL}\\?op=\\w+Count$`),
      )
      // GET form: no RequestInit (no method/body) is passed at all.
      expect(call[1]).toBeUndefined()
    }
    expect(counts).toEqual({
      users: 42,
      organizations: 42,
      achievements: 42,
      projects: 42,
      endorsements: 42,
    })
  })

  it("yields null for a failing op while the others still resolve", async () => {
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), "http://localhost")
      const op = url.searchParams.get("op") ?? ""
      if (op === "OrganizationCount") {
        return new Response("upstream down", { status: 502 })
      }
      if (op === "AwardCount") {
        return new Response(
          JSON.stringify({ errors: [{ message: "boom" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      const root = OP_ROOTS[op]
      return new Response(
        JSON.stringify({ data: { [root]: { totalCount: 7 } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })

    const counts = await fetchNetworkCounts()

    expect(counts).toEqual({
      users: 7,
      organizations: null,
      achievements: 7,
      projects: 7,
      endorsements: null,
    })
  })
})
