import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Tests for the IP+DID rate limiter on GET /api/resolve-did (judgment-002).
 *
 * The route is unauthenticated and issues up to 3 outbound fetches per
 * request, so it mirrors the search-actors limiter: ~60/min per IP AND
 * per DID, fail-OPEN on a limiter backend error, 429 + Retry-After once
 * the cap is exceeded.
 *
 * Approach: let the REAL rate-limit logic run (so we exercise the actual
 * `enforceRateLimitMulti` integration) but control the limiter backend by
 * mocking `getRedis` from `@/lib/auth/stores`. The route's heavy atproto /
 * session deps are stubbed to no-ops — none of them should even be reached
 * once the limiter denies. `fetch` is mocked so an allowed request never
 * touches the network.
 */

const incr = vi.fn()
const expire = vi.fn().mockResolvedValue(1)

vi.mock("@/lib/auth/stores", () => ({
  getRedis: () => ({ incr, expire }),
}))

vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(async () => null),
}))

vi.mock("@/lib/atproto/did", () => ({
  resolveHandle: vi.fn(async () => "alice.test"),
  resolveHandleToDid: vi.fn(async () => null),
  resolvePdsUrl: vi.fn(async () => null),
}))

const VALID_DID = "did:plc:abcdefghijklmnopqrstuvwx"

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  incr.mockReset()
  expire.mockReset().mockResolvedValue(1)
  globalThis.fetch = mockFetch as unknown as typeof fetch
  // Default: profile lookups return nothing of interest (404). Fresh
  // Response per call since bodies are single-use streams.
  mockFetch.mockReset()
  mockFetch.mockImplementation(() =>
    Promise.resolve(new Response("", { status: 404 })),
  )
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

async function getResolve(did: string): Promise<Response> {
  vi.resetModules()
  const { GET } = await import("../route")
  const req = new NextRequest(
    `http://localhost/api/resolve-did?did=${encodeURIComponent(did)}`,
    { headers: { "x-real-ip": "203.0.113.7" } },
  )
  return GET(req)
}

describe("/api/resolve-did rate limiter (judgment-002)", () => {
  it("returns 429 + Retry-After once the per-window cap is exceeded", async () => {
    // First call past the cap. The limiter is 60/min; a count of 61
    // means this request tripped the bucket. incr is called once per
    // identifier (DID + IP) per request — return 61 for both so the
    // first checked bucket already denies.
    incr.mockResolvedValue(61)

    const res = await getResolve(VALID_DID)

    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
    const body = await res.json()
    expect(body.error).toBeTruthy()
    // Denied before any upstream profile fetch.
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("allows a request under the cap", async () => {
    incr.mockResolvedValue(1)
    const res = await getResolve(VALID_DID)
    expect(res.status).toBe(200)
    // Allowed — the route proceeded to its upstream profile lookups.
    expect(mockFetch).toHaveBeenCalled()
  })

  it("fails OPEN when the limiter backend errors (allows the request)", async () => {
    // Redis unreachable → incr rejects. enforceRateLimitMulti must
    // swallow this and allow the request rather than 500/429.
    incr.mockRejectedValue(new Error("ECONNREFUSED"))

    const res = await getResolve(VALID_DID)

    expect(res.status).toBe(200)
    expect(res.status).not.toBe(429)
    // The request proceeded despite the limiter failure.
    expect(mockFetch).toHaveBeenCalled()
  })
})
