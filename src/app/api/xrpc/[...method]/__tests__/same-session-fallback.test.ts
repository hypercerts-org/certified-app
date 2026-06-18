import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the same-session public-read FALLBACK in the XRPC proxy GET
 * handler.
 *
 * `listRecords` / `getRecord` / `getBlob` are public XRPCs, so a read of
 * the user's OWN repo must not 500 just because their bound OAuth session
 * is degraded (expired/unrefreshable token, DPoP hiccup, a transient
 * PDS-auth 5xx). When the bound agent call throws, the handler resolves
 * the repo's home PDS and proxies the public read instead — the user
 * still sees their own public records.
 *
 * Regression guard for the "Could not load lists: Failed to read
 * collections: 500" report: the Lists tab reads the viewer's own
 * `org.hypercerts.collection` records, which on the own-profile view
 * takes the same-session branch.
 */

const getSessionDid = vi.fn()
const getOAuthClient = vi.fn()
const resolvePdsUrl = vi.fn()
const listRecords = vi.fn()
const getRecord = vi.fn()

vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient }))
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
}))
vi.mock("@atproto/api", () => ({
  Agent: class {
    com = {
      atproto: {
        repo: { listRecords, getRecord },
      },
    }
  },
}))

const OWN_DID = "did:plc:s4puetfspot742ai7y4otuel"

function makeRequest(query: string) {
  const url = new URL(`https://app.example/api/xrpc/${query}`)
  return { nextUrl: url } as unknown as Parameters<
    Awaited<typeof import("../route")>["GET"]
  >[0]
}

beforeEach(() => {
  getSessionDid.mockReset().mockResolvedValue(OWN_DID)
  // A restorable session that still hands back an agent — the failure we
  // model is the *call* throwing, not session restore (which is already
  // caught earlier and falls through unauth for public reads).
  getOAuthClient.mockReset().mockResolvedValue({
    restore: vi.fn().mockResolvedValue({}),
  })
  resolvePdsUrl.mockReset().mockResolvedValue("https://pds.example")
  listRecords.mockReset()
  getRecord.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("same-session listRecords fallback", () => {
  it("falls back to the public PDS read (200) when the bound agent throws", async () => {
    const { GET } = await import("../route")
    // Degraded session: the agent's listRecords blows up with a
    // status-less error (the shape that otherwise collapses to 500).
    listRecords.mockRejectedValue(new Error("token refresh failed"))

    const records = [{ uri: "at://x/y/z", cid: "bafy", value: { type: "list:certs" } }]
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ records }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const res = await GET(
      makeRequest(
        `com.atproto.repo.listRecords?repo=${OWN_DID}&collection=org.hypercerts.collection&limit=100&reverse=true`,
      ),
      { params: Promise.resolve({ method: ["com.atproto.repo.listRecords"] }) },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.records).toEqual(records)
    // The public read targeted the repo's home PDS, forwarding limit/reverse.
    expect(resolvePdsUrl).toHaveBeenCalledWith(OWN_DID)
    const calledUrl = String(fetchSpy.mock.calls[0][0])
    expect(calledUrl).toContain("https://pds.example/xrpc/com.atproto.repo.listRecords")
    expect(calledUrl).toContain("reverse=true")
    fetchSpy.mockRestore()
  })

  it("does not hit the public path when the bound agent succeeds", async () => {
    const { GET } = await import("../route")
    const records = [{ uri: "at://a/b/c", cid: "bafy2", value: {} }]
    listRecords.mockResolvedValue({ data: { records } })
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const res = await GET(
      makeRequest(
        `com.atproto.repo.listRecords?repo=${OWN_DID}&collection=org.hypercerts.collection`,
      ),
      { params: Promise.resolve({ method: ["com.atproto.repo.listRecords"] }) },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.records).toEqual(records)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(resolvePdsUrl).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe("same-session getRecord fallback", () => {
  it("falls back to the public PDS read (200) when the bound agent throws", async () => {
    const { GET } = await import("../route")
    getRecord.mockRejectedValue(new Error("dpop nonce mismatch"))

    const record = { uri: "at://x/y/z", cid: "bafy", value: { title: "hi" } }
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(record), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const res = await GET(
      makeRequest(
        `com.atproto.repo.getRecord?repo=${OWN_DID}&collection=org.hypercerts.claim.activity&rkey=abc`,
      ),
      { params: Promise.resolve({ method: ["com.atproto.repo.getRecord"] }) },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.value.title).toBe("hi")
    fetchSpy.mockRestore()
  })
})
