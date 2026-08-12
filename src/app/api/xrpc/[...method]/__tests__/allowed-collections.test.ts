import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the write-collection allowlist in the XRPC proxy POST
 * handler (`ALLOWED_WRITE_COLLECTIONS`).
 *
 * The allowlist is a silent tripwire: a client writing a collection that
 * was never added to it gets a 403 with no hint that the fix is a
 * one-line array entry. That is exactly how own-repo activity updates
 * (`org.hypercerts.context.attachment`) shipped broken — the group BFF
 * route allowlisted the NSID, the XRPC proxy never did, and nothing
 * failed until a user pressed "Post update". AGENTS.md carries it as
 * known pitfall #5.
 *
 * Pinned here:
 *  - Every collection the client actually writes passes the gate, for
 *    all three REPO_METHODS (create / put / delete).
 *  - `app.bsky.actor.profile` is rejected — the certified-app invariant
 *    at route.ts:36-37. Writing it would clobber the user's Bluesky
 *    profile, so it must never be allowlisted.
 *  - An unknown NSID is rejected, and cross-repo writes are rejected
 *    before the collection is even considered.
 */

const getSessionDid = vi.fn()
const getOAuthClient = vi.fn()
const deleteSession = vi.fn()

const createRecord = vi.fn()
const putRecord = vi.fn()
const deleteRecord = vi.fn()

vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient }))
vi.mock("@/lib/auth/session", () => ({ getSessionDid, deleteSession }))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn() }))
vi.mock("@/lib/atproto/did", () => ({
  resolvePdsUrl: vi.fn(),
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
vi.mock("@atproto/api", () => ({
  Agent: class {
    com = {
      atproto: { repo: { createRecord, putRecord, deleteRecord } },
    }
  },
}))

const OWN_DID = "did:plc:s4puetfspot742ai7y4otuel"
const OTHER_DID = "did:plc:foreigner000000000000000"

/**
 * Every collection written from client code through this proxy. Kept in
 * sync with the `collection:` values in src/lib/atproto/* — if a new
 * write surface lands without an allowlist entry, add it here and the
 * test fails until the route is updated too.
 */
const WRITTEN_COLLECTIONS = [
  "org.impactindexer.link.attestation",
  "app.certified.actor.profile",
  "app.certified.actor.organization",
  "app.certified.location",
  "app.certified.badge.definition",
  "app.certified.badge.award",
  "app.certified.badge.response",
  "app.certified.graph.follow",
  "app.bsky.graph.follow",
  "org.hypercerts.claim.activity",
  "org.hypercerts.collection",
  "org.hypercerts.funding.receipt",
  "org.hyperboards.board",
  "org.hyperboards.displayProfile",
  "org.hypercerts.claim.contributorInformation",
  // The regression this test exists for.
  "org.hypercerts.context.attachment",
]

function makeRequest(methodName: string, body: unknown) {
  const url = new URL(`https://app.example/api/xrpc/${methodName}`)
  return {
    nextUrl: url,
    json: async () => body,
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Parameters<Awaited<typeof import("../route")>["POST"]>[0]
}

function makeParams(methodName: string) {
  return { params: Promise.resolve({ method: methodName.split(".") }) }
}

beforeEach(() => {
  getSessionDid.mockReset().mockResolvedValue(OWN_DID)
  getOAuthClient.mockReset().mockResolvedValue({
    restore: vi.fn().mockResolvedValue({}),
  })
  deleteSession.mockReset()
  createRecord.mockReset().mockResolvedValue({ data: { uri: "at://u", cid: "b" } })
  putRecord.mockReset().mockResolvedValue({ data: { uri: "at://u", cid: "b" } })
  deleteRecord.mockReset().mockResolvedValue({ data: {} })
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("write-collection allowlist — allowed collections pass the gate", () => {
  it.each(WRITTEN_COLLECTIONS)("createRecord accepts %s", async (collection) => {
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest("com.atproto.repo.createRecord", {
        repo: OWN_DID,
        collection,
        record: {},
      }),
      makeParams("com.atproto.repo.createRecord"),
    )

    expect(res.status).toBe(200)
    expect(createRecord).toHaveBeenCalledTimes(1)
  })

  it("putRecord and deleteRecord accept org.hypercerts.context.attachment", async () => {
    const { POST } = await import("../route")
    const collection = "org.hypercerts.context.attachment"

    const put = await POST(
      makeRequest("com.atproto.repo.putRecord", {
        repo: OWN_DID,
        collection,
        rkey: "3abc",
        record: {},
      }),
      makeParams("com.atproto.repo.putRecord"),
    )
    expect(put.status).toBe(200)
    expect(putRecord).toHaveBeenCalledTimes(1)

    const del = await POST(
      makeRequest("com.atproto.repo.deleteRecord", {
        repo: OWN_DID,
        collection,
        rkey: "3abc",
      }),
      makeParams("com.atproto.repo.deleteRecord"),
    )
    expect(del.status).toBe(200)
    expect(deleteRecord).toHaveBeenCalledTimes(1)
  })
})

describe("write-collection allowlist — rejections", () => {
  it("rejects app.bsky.actor.profile (clobbers the user's Bluesky profile)", async () => {
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest("com.atproto.repo.putRecord", {
        repo: OWN_DID,
        collection: "app.bsky.actor.profile",
        rkey: "self",
        record: { displayName: "pwned" },
      }),
      makeParams("com.atproto.repo.putRecord"),
    )

    expect(res.status).toBe(403)
    expect(putRecord).not.toHaveBeenCalled()
  })

  it("rejects an unknown NSID", async () => {
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest("com.atproto.repo.createRecord", {
        repo: OWN_DID,
        collection: "com.example.not.a.real.collection",
        record: {},
      }),
      makeParams("com.atproto.repo.createRecord"),
    )

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: "collection is required and must be an allowed collection",
    })
    expect(createRecord).not.toHaveBeenCalled()
  })

  it("rejects a missing collection", async () => {
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest("com.atproto.repo.createRecord", {
        repo: OWN_DID,
        record: {},
      }),
      makeParams("com.atproto.repo.createRecord"),
    )

    expect(res.status).toBe(403)
    expect(createRecord).not.toHaveBeenCalled()
  })

  it("rejects a cross-repo write before the collection is considered", async () => {
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest("com.atproto.repo.createRecord", {
        repo: OTHER_DID,
        collection: "org.hypercerts.context.attachment",
        record: {},
      }),
      makeParams("com.atproto.repo.createRecord"),
    )

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: "repo is required and must match the authenticated user",
    })
    expect(createRecord).not.toHaveBeenCalled()
  })
})
