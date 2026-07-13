import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the GET /api/indexer edge-cacheable variant.
 *
 * Contract pinned here:
 *  - Only the CACHEABLE_OPS allowlist (five zero-variable count ops +
 *    AllEndorsements + OrganizationDids) is servable via GET; every
 *    other op — including ones POST accepts — 400s without an
 *    upstream call.
 *  - A clean 200 (no GraphQL `errors`) carries the shared-cache
 *    Cache-Control; counts get the long TTL, the paginated scans the
 *    short one.
 *  - A 200 body WITH `errors`, or a non-200 upstream, carries NO
 *    Cache-Control at all — a transient failure must never be pinned
 *    at the edge for the full TTL.
 *
 * Same harness as route.test.ts: mock `fetch` (no real indexer), and
 * build a minimal NextRequest stand-in (the handler reads
 * `nextUrl.searchParams`, `headers`, and `signal`).
 */

vi.mock("@/lib/auth/csrf", () => ({
  checkCsrf: () => null,
}))

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
  // Fresh Response per call — bodies are one-shot streams.
  mockFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  )
  // The limiter fail-opens without Redis but warns; keep output clean.
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

async function getIndexer(query: string): Promise<Response> {
  const { GET } = await import("../route")
  const url = new URL(`http://localhost/api/indexer${query}`)
  const req = {
    nextUrl: url,
    headers: new Headers(),
    signal: new AbortController().signal,
  }
  return GET(req as unknown as Parameters<typeof GET>[0])
}

describe("GET /api/indexer (edge-cacheable allowlist)", () => {
  describe("allowlist", () => {
    it("400s on an op outside CACHEABLE_OPS, even one POST accepts", async () => {
      for (const op of ["FollowerEvents", "ReceivedEndorsements", "FundingReceipts", "nope"]) {
        mockFetch.mockClear()
        const res = await getIndexer(`?op=${op}`)
        expect(res.status, `op=${op}`).toBe(400)
        const body = await res.json()
        expect(body.error).toBe("Unknown operation")
        expect(mockFetch).not.toHaveBeenCalled()
      }
    })

    it("400s when op is missing", async () => {
      const res = await getIndexer("")
      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("serves each allowlisted op with the same body as POST", async () => {
      const ops = [
        "ProfileCount",
        "OrganizationCount",
        "ActivityCount",
        "ProjectCount",
        "AwardCount",
        "AllEndorsements",
        "OrganizationDids",
      ]
      for (const op of ops) {
        mockFetch.mockClear()
        const res = await getIndexer(`?op=${op}`)
        expect(res.status, `op=${op}`).toBe(200)
        expect(await res.json()).toEqual({ data: {} })
        const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
        expect(body.operationName).toBe(op)
        expect(body.query).toContain(`query ${op}`)
      }
    })
  })

  describe("Cache-Control", () => {
    it("counts get the long shared TTL on a clean 200", async () => {
      const res = await getIndexer("?op=ProfileCount")
      expect(res.status).toBe(200)
      expect(res.headers.get("cache-control")).toBe(
        "public, s-maxage=300, stale-while-revalidate=86400",
      )
    })

    it("AllEndorsements pages get the short shared TTL", async () => {
      const res = await getIndexer("?op=AllEndorsements&badgeType=award&first=100")
      expect(res.status).toBe(200)
      expect(res.headers.get("cache-control")).toBe(
        "public, s-maxage=60, stale-while-revalidate=600",
      )
      // Variables ride the query string so they are part of the edge
      // cache key — verify the validated values were forwarded.
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.badgeType).toBe("award")
      expect(body.variables.first).toBe(100)
    })

    it("omits Cache-Control when the 200 body carries GraphQL errors", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: [{ message: "boom" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      const res = await getIndexer("?op=ActivityCount")
      expect(res.status).toBe(200)
      expect(res.headers.get("cache-control")).toBeNull()
    })

    it("omits Cache-Control when the upstream is non-200", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("bad gateway", { status: 502 }),
      )
      const res = await getIndexer("?op=ActivityCount")
      expect(res.status).toBe(502)
      expect(res.headers.get("cache-control")).toBeNull()
    })

    it("omits Cache-Control when the 200 body is not JSON", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("<html>upstream proxy page</html>", { status: 200 }),
      )
      const res = await getIndexer("?op=ActivityCount")
      expect(res.status).toBe(200)
      expect(res.headers.get("cache-control")).toBeNull()
    })
  })

  describe("variable validation via query string", () => {
    it("400s on an invalid badgeType (same allowlist as POST)", async () => {
      const res = await getIndexer("?op=AllEndorsements&badgeType=injected")
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe("Invalid variables for operation")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("clamps first and forwards after like the POST form", async () => {
      await getIndexer("?op=OrganizationDids&first=99999&after=cursor123")
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.variables.first).toBe(100)
      expect(body.variables.after).toBe("cursor123")
    })
  })
})
