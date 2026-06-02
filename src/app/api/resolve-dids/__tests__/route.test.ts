import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Tests for the batched POST /api/resolve-dids route — the sibling of
 * GET /api/resolve-did that resolves a whole page of author / contributor
 * identities in one request (so a busy explore page doesn't fire one GET
 * per row and trip the 60/min limit).
 *
 * Approach mirrors the resolve-did rate-limit suite: let the REAL limiter
 * run with a stubbed Redis backend (incr -> 1 allows), stub the atproto /
 * session deps, and mock global fetch so an allowed request resolves each
 * identity through the shared core without touching the network. The
 * certs lookup is short-circuited (resolvePdsUrl -> null), so each
 * identity resolves to its handle via the legacy fan-out.
 */

// The batch route charges the limiter by identity count, so it uses
// `incrby` (cost > 1). `incr` is kept for the single-identity cost-1 path.
const incr = vi.fn()
const incrby = vi.fn()
const expire = vi.fn().mockResolvedValue(1)

vi.mock("@/lib/auth/stores", () => ({
  getRedis: () => ({ incr, incrby, expire }),
}))

vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(async () => null),
}))

vi.mock("@/lib/atproto/did", () => ({
  resolveHandle: vi.fn(async (did: string) => `${did.slice(-4)}.test`),
  resolveHandleToDid: vi.fn(async (handle: string) =>
    handle === "known.test" ? "did:plc:cccccccccccccccccccccccc" : null,
  ),
  resolvePdsUrl: vi.fn(async () => null),
}))

const DID_A = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"
const DID_B = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb"
const DID_FROM_HANDLE = "did:plc:cccccccccccccccccccccccc"

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  // Default: fresh bucket — return the amount added so the count stays
  // well under the 600/min budget and the request is allowed.
  incr.mockReset().mockResolvedValue(1)
  incrby.mockReset().mockImplementation(async (_key: string, by: number) => by)
  expire.mockReset().mockResolvedValue(1)
  globalThis.fetch = mockFetch as unknown as typeof fetch
  // appView getProfile returns a minimal bsky profile; everything else
  // 404s. Fresh Response per call (bodies are single-use streams).
  mockFetch.mockReset()
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("getProfile")) {
      return Promise.resolve(
        new Response(JSON.stringify({ displayName: "Someone" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }
    return Promise.resolve(new Response("", { status: 404 }))
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

async function postResolve(body: unknown): Promise<Response> {
  vi.resetModules()
  const { POST } = await import("../route")
  const req = new NextRequest("http://localhost/api/resolve-dids", {
    method: "POST",
    headers: { "x-real-ip": "203.0.113.7", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return POST(req)
}

describe("POST /api/resolve-dids", () => {
  it("resolves a batch keyed by the exact input identity", async () => {
    const res = await postResolve({ identities: [DID_A, DID_B] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body.results).sort()).toEqual([DID_A, DID_B].sort())
    expect(body.results[DID_A].did).toBe(DID_A)
    expect(body.results[DID_A].handle).toBe(`${DID_A.slice(-4)}.test`)
  })

  it("resolves a handle identity to its DID", async () => {
    const res = await postResolve({ identities: ["known.test"] })
    const body = await res.json()
    expect(body.results["known.test"]).not.toBeNull()
    expect(body.results["known.test"].did).toBe(DID_FROM_HANDLE)
  })

  it("returns null for an unresolvable identity without failing the batch", async () => {
    const res = await postResolve({ identities: [DID_A, "not a handle"] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results[DID_A]).not.toBeNull()
    expect(body.results["not a handle"]).toBeNull()
  })

  it("dedupes and ignores non-string entries", async () => {
    const res = await postResolve({ identities: [DID_A, DID_A, 42, "", "  "] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body.results)).toEqual([DID_A])
  })

  it("rejects a non-array body with 400", async () => {
    const res = await postResolve({ identities: "nope" })
    expect(res.status).toBe(400)
  })

  it("rejects more than the per-request cap with 400", async () => {
    const many = Array.from(
      { length: 51 },
      (_, i) => `did:plc:${i.toString().padStart(24, "0")}`,
    )
    const res = await postResolve({ identities: many })
    expect(res.status).toBe(400)
  })

  it("returns an empty result set for an empty list (no upstream calls)", async () => {
    const res = await postResolve({ identities: [] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toEqual({})
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("returns 429 when the limiter denies, before any upstream work", async () => {
    // Over the 600-identity/min budget on both the cost-1 (incr) and
    // weighted (incrby) paths.
    incr.mockResolvedValue(601)
    incrby.mockResolvedValue(601)
    const res = await postResolve({ identities: [DID_A] })
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("charges the limiter by identity count (incrby = batch size)", async () => {
    await postResolve({ identities: [DID_A, DID_B] })
    // Two distinct identities -> cost 2 on each bucket (DID + IP).
    expect(incrby).toHaveBeenCalledWith(expect.any(String), 2)
  })
})
