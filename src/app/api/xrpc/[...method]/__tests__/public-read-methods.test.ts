import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the signed-out read boundary in the XRPC proxy GET handler
 * (`PUBLIC_READ_METHODS`).
 *
 * The proxy serves three atproto reads to unauthenticated visitors —
 * `getRecord`, `listRecords`, `sync.getBlob` — because public profiles,
 * activities and avatars have to render for logged-out users. Everything
 * else 401s.
 *
 * Two ways this can rot, in opposite directions:
 *  - too narrow → a public page silently 401s for signed-out visitors
 *    while working perfectly for the logged-in developer who wrote it;
 *  - too wide → a session-bearing method becomes readable anonymously.
 *
 * Asserted behaviourally (no session cookie at all) rather than by
 * exporting the Set, so the test exercises the real gate at route.ts.
 */

const getSessionDid = vi.fn()
const getOAuthClient = vi.fn()
const resolvePdsUrl = vi.fn()

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
  makeLimiter: (name: string, max: number, windowSec: number) => ({
    name,
    max,
    windowSec,
  }),
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock("@/lib/utils/ip", () => ({ clientIp: () => "test-ip" }))
vi.mock("@atproto/api", () => ({ Agent: class {} }))

const SOME_DID = "did:plc:s4puetfspot742ai7y4otuel"

function makeGet(query: string) {
  const url = new URL(`https://app.example/api/xrpc/${query}`)
  return { nextUrl: url } as unknown as Parameters<
    Awaited<typeof import("../route")>["GET"]
  >[0]
}

function makePost(body: unknown) {
  return {
    nextUrl: new URL("https://app.example/api/xrpc/com.atproto.repo.createRecord"),
    json: async () => body,
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Parameters<Awaited<typeof import("../route")>["POST"]>[0]
}

function params(methodName: string) {
  return { params: Promise.resolve({ method: methodName.split(".") }) }
}

beforeEach(() => {
  // No session cookie — every request in this file is anonymous.
  getSessionDid.mockReset().mockResolvedValue(null)
  getOAuthClient.mockReset()
  resolvePdsUrl.mockReset().mockResolvedValue("https://pds.example")
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("public reads — served without a session", () => {
  it("getRecord is public", async () => {
    const { GET } = await import("../route")
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ uri: "at://x", value: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const res = await GET(
      makeGet(
        `com.atproto.repo.getRecord?repo=${SOME_DID}&collection=app.certified.actor.profile&rkey=self`,
      ),
      params("com.atproto.repo.getRecord"),
    )

    expect(res.status).not.toBe(401)
    expect(getOAuthClient).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it("listRecords is public", async () => {
    const { GET } = await import("../route")
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const res = await GET(
      makeGet(
        `com.atproto.repo.listRecords?repo=${SOME_DID}&collection=org.hypercerts.claim.activity`,
      ),
      params("com.atproto.repo.listRecords"),
    )

    expect(res.status).not.toBe(401)
    fetchSpy.mockRestore()
  })

  it("sync.getBlob is public (avatars on signed-out pages)", async () => {
    const { GET } = await import("../route")
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bytes", {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "5" },
      }),
    )

    const res = await GET(
      makeGet(`com.atproto.sync.getBlob?did=${SOME_DID}&cid=bafkreigh2akiscaildc`),
      params("com.atproto.sync.getBlob"),
    )

    expect(res.status).not.toBe(401)
    fetchSpy.mockRestore()
  })
})

describe("non-public methods — 401 without a session", () => {
  it.each([
    "com.atproto.server.getSession",
    "com.atproto.identity.updateHandle",
    "com.atproto.server.createAppPassword",
  ])("%s requires auth", async (method) => {
    const { GET } = await import("../route")
    const res = await GET(makeGet(method), params(method))
    expect(res.status).toBe(401)
  })

  it("writes are never anonymous, even for an allowlisted collection", async () => {
    const { POST } = await import("../route")
    const res = await POST(
      makePost({
        repo: SOME_DID,
        collection: "org.hypercerts.context.attachment",
        record: {},
      }),
      params("com.atproto.repo.createRecord"),
    )

    expect(res.status).toBe(401)
  })
})
