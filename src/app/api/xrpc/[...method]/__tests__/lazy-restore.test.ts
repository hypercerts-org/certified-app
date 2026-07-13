import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the lazy OAuth-session restore in the XRPC proxy GET
 * handler.
 *
 * The old handler restored the full OAuth session (Upstash read +
 * DPoP deserialization, possibly a token refresh) for EVERY signed-in
 * GET — including foreign-repo/blob reads that never touch the bound
 * agent. The restore is now deferred into a `getAgent` helper invoked
 * only by the same-session branches and the auth-required methods.
 *
 * Pinned here:
 *  - Foreign-repo listRecords / foreign-DID getBlob with a session
 *    cookie never call `getOAuthClient` at all.
 *  - getSession with a cookie whose restore fails still 401s AND
 *    still drops the stale session cookie (deleteSession).
 *  - A same-repo read whose restore fails falls back to the public
 *    PDS read instead of 500/401 — degraded sessions must not break
 *    reading a user's own public records.
 */

const getSessionDid = vi.fn()
const getOAuthClient = vi.fn()
const deleteSession = vi.fn()
const resolvePdsUrl = vi.fn()

vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient }))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid,
  deleteSession,
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

const OWN_DID = "did:plc:s4puetfspot742ai7y4otuel"
const FOREIGN_DID = "did:plc:foreigner000000000000000"

function makeRequest(query: string) {
  const url = new URL(`https://app.example/api/xrpc/${query}`)
  return { nextUrl: url } as unknown as Parameters<
    Awaited<typeof import("../route")>["GET"]
  >[0]
}

function makeParams(methodName: string) {
  return { params: Promise.resolve({ method: methodName.split(".") }) }
}

beforeEach(() => {
  getSessionDid.mockReset().mockResolvedValue(OWN_DID)
  getOAuthClient.mockReset()
  deleteSession.mockReset()
  resolvePdsUrl.mockReset().mockResolvedValue("https://pds.example")
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("lazy restore — foreign reads skip the OAuth session entirely", () => {
  it("foreign-repo listRecords with a session cookie never calls getOAuthClient", async () => {
    const { GET } = await import("../route")
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const res = await GET(
      makeRequest(
        `com.atproto.repo.listRecords?repo=${FOREIGN_DID}&collection=org.hypercerts.collection`,
      ),
      makeParams("com.atproto.repo.listRecords"),
    )

    expect(res.status).toBe(200)
    expect(getOAuthClient).not.toHaveBeenCalled()
    // The read federated straight to the foreign repo's home PDS.
    expect(resolvePdsUrl).toHaveBeenCalledWith(FOREIGN_DID)
    fetchSpy.mockRestore()
  })

  it("foreign-DID getBlob with a session cookie never calls getOAuthClient", async () => {
    const { GET } = await import("../route")
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("blob-bytes", {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "10" },
      }),
    )

    const res = await GET(
      makeRequest(`com.atproto.sync.getBlob?did=${FOREIGN_DID}&cid=bafkreigh2akiscaildc`),
      makeParams("com.atproto.sync.getBlob"),
    )

    expect(res.status).toBe(200)
    expect(getOAuthClient).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe("lazy restore — auth-required methods still fail closed", () => {
  it("getSession with a failed restore returns 401 and deletes the session", async () => {
    const { GET } = await import("../route")
    getOAuthClient.mockResolvedValue({
      restore: vi.fn().mockRejectedValue(new Error("token refresh failed")),
    })

    const res = await GET(
      makeRequest("com.atproto.server.getSession"),
      makeParams("com.atproto.server.getSession"),
    )

    expect(res.status).toBe(401)
    expect(deleteSession).toHaveBeenCalledTimes(1)
  })

  it("getSession without a session cookie returns 401 without touching OAuth", async () => {
    const { GET } = await import("../route")
    getSessionDid.mockResolvedValue(null)

    const res = await GET(
      makeRequest("com.atproto.server.getSession"),
      makeParams("com.atproto.server.getSession"),
    )

    expect(res.status).toBe(401)
    expect(getOAuthClient).not.toHaveBeenCalled()
    expect(deleteSession).not.toHaveBeenCalled()
  })
})

describe("lazy restore — same-repo reads degrade to the public proxy", () => {
  it("same-repo listRecords falls back to the public read when restore fails", async () => {
    const { GET } = await import("../route")
    getOAuthClient.mockResolvedValue({
      restore: vi.fn().mockRejectedValue(new Error("dpop hiccup")),
    })

    const records = [{ uri: "at://x/y/z", cid: "bafy", value: {} }]
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ records }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const res = await GET(
      makeRequest(
        `com.atproto.repo.listRecords?repo=${OWN_DID}&collection=org.hypercerts.collection`,
      ),
      makeParams("com.atproto.repo.listRecords"),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ records })
    // Restore was attempted (same-repo branch wants the bound agent),
    // failed, dropped the stale cookie, and degraded to the public read.
    expect(getOAuthClient).toHaveBeenCalledTimes(1)
    expect(deleteSession).toHaveBeenCalledTimes(1)
    expect(resolvePdsUrl).toHaveBeenCalledWith(OWN_DID)
    fetchSpy.mockRestore()
  })
})
