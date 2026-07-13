import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the foreign-DID `com.atproto.sync.getBlob` branch of the
 * XRPC proxy GET handler (judgment-009 — api-trust-4).
 *
 * Posture pinned here:
 *  - An upstream Content-Length over the server ceiling
 *    (MAX_FOREIGN_BLOB_SIZE) short-circuits with 413 BEFORE streaming,
 *    so a hostile-but-allowlisted PDS can't push an oversized blob for
 *    an attacker-chosen DID through our proxy.
 *  - The response Cache-Control is a fixed server-controlled value, not
 *    whatever the upstream PDS forwards — CIDs are immutable, so the
 *    proxy owns the CDN directive.
 *
 * The route module pulls in server-only deps (OAuth client, session,
 * atproto Agent, DID resolution) at import time, so we mock those. The
 * foreign-blob branch is reachable unauthenticated (getBlob is a public
 * read method): getSessionDid → null, resolvePdsUrl → a PDS URL, and a
 * stubbed global fetch returns the upstream Response.
 */

const getSessionDid = vi.fn()
const resolvePdsUrl = vi.fn()

vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid,
  deleteSession: vi.fn(),
}))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn() }))
vi.mock("@/lib/atproto/did", () => ({
  resolvePdsUrl,
  invalidateDidDoc: vi.fn(),
}))
vi.mock("@/lib/auth/rate-limit", () => ({
  checkAndIncrementWriteRate: vi.fn(),
  RATE_LIMITED_WRITE_COLLECTIONS: {},
  makeLimiter: (name: string, max: number, windowSec: number) => ({
    name,
    max,
    windowSec,
  }),
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock("@/lib/utils/ip", () => ({ clientIp: () => "test-ip" }))
vi.mock("@atproto/api", () => ({ Agent: class {} }))

const FOREIGN_DID = "did:plc:foreigner000000000000000"
const CID = "bafkreigh2akiscaildc000000000000000000000000000000000000000000"

function makeRequest() {
  // Minimal stand-in for NextRequest's surface used by the handler:
  // it only reads `request.nextUrl.searchParams`.
  const url = new URL(
    `https://app.example/api/xrpc/com.atproto.sync.getBlob?did=${FOREIGN_DID}&cid=${CID}`,
  )
  return { nextUrl: url } as unknown as Parameters<
    Awaited<typeof import("../route")>["GET"]
  >[0]
}

const params = Promise.resolve({
  method: ["com.atproto.sync.getBlob"],
})

beforeEach(() => {
  getSessionDid.mockReset()
  resolvePdsUrl.mockReset()
  // Unauthenticated visitor; getBlob is a public read method.
  getSessionDid.mockResolvedValue(null)
  resolvePdsUrl.mockResolvedValue("https://pds.example")
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("foreign-DID getBlob — Content-Length cap + fixed Cache-Control", () => {
  it("short-circuits with 413 when upstream Content-Length exceeds the cap", async () => {
    const { GET } = await import("../route")
    const oversized = String(10 * 1024 * 1024 + 1)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ignored", {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": oversized,
          "cache-control": "public, max-age=1",
        },
      }),
    )

    const res = await GET(makeRequest(), { params })

    expect(res.status).toBe(413)
    fetchSpy.mockRestore()
  })

  it("replaces upstream Cache-Control with the fixed server value", async () => {
    const { GET } = await import("../route")
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("blob-bytes", {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": "10",
          // A hostile/lying upstream directive we must NOT forward.
          "cache-control": "private, no-store, max-age=0",
        },
      }),
    )

    const res = await GET(makeRequest(), { params })

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=86400, immutable",
    )
    expect(res.headers.get("cache-control")).not.toContain("no-store")
    fetchSpy.mockRestore()
  })
})
