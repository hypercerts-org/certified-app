import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the GROUP-handle route
 * (`PUT` /api/groups/[groupDid]/account/handle).
 *
 * This is the safety-critical "rename the GROUP, not the caller" path: the
 * handle update MUST run `com.atproto.identity.updateHandle` with the GROUP's
 * own session (via `callPds(callerDid, groupDid, …)`) and the trimmed handle.
 * On success the route must evict the group's DID-doc cache so a later
 * resolveHandle sees the new handle.
 *
 * `callPds` is mocked to return either `locked` or a stubbed PDS `response`;
 * `invalidateDidDoc` is mocked so we can assert it fires only on success.
 */

vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  makeLimiter: vi.fn(() => ({})),
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(async () => "did:plc:alice"),
}))
vi.mock("@/lib/atproto/did", () => ({
  invalidateDidDoc: vi.fn(() => undefined),
}))
vi.mock("@/lib/auth/group-account-session", () => ({
  callPds: vi.fn(),
}))

import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit } from "@/lib/auth/rate-limit"
import { getSessionDid } from "@/lib/auth/session"
import { invalidateDidDoc } from "@/lib/atproto/did"
import { callPds } from "@/lib/auth/group-account-session"

const GROUP_DID = "did:plc:abcdefghijklmnopqrstuvwx"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function makeRequest(body?: unknown): Request {
  return new Request(
    `https://example.test/api/groups/${GROUP_DID}/account/handle`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        origin: "https://example.test",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  )
}

function makeContext(groupDid = GROUP_DID) {
  return { params: Promise.resolve({ groupDid }) }
}

async function put(body?: unknown, groupDid = GROUP_DID): Promise<Response> {
  const { PUT } = await import("../route")
  return PUT(
    makeRequest(body) as unknown as Parameters<typeof PUT>[0],
    makeContext(groupDid) as unknown as Parameters<typeof PUT>[1],
  )
}

beforeEach(() => {
  vi.mocked(getSessionDid).mockReset().mockResolvedValue("did:plc:alice")
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(null)
  vi.mocked(invalidateDidDoc).mockReset()
  vi.mocked(callPds).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PUT (update group handle)", () => {
  it("calls updateHandle with the GROUP session + trimmed handle, then evicts the DID-doc cache", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({}),
    })
    const res = await put({ handle: "  newgroup.test  " })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    // Safety-critical: the GROUP's session (callerDid, groupDid) renames the
    // GROUP, and the handle is trimmed before forwarding.
    expect(callPds).toHaveBeenCalledWith(
      "did:plc:alice",
      GROUP_DID,
      "com.atproto.identity.updateHandle",
      { method: "POST", body: { handle: "newgroup.test" } },
    )
    expect(invalidateDidDoc).toHaveBeenCalledWith(GROUP_DID)
  })

  it("401 { error: 'locked' } when the session is locked — and does NOT evict the cache", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({ kind: "locked" })
    const res = await put({ handle: "newgroup.test" })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "locked" })
    expect(invalidateDidDoc).not.toHaveBeenCalled()
  })

  it("does NOT evict the cache when the upstream update fails", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({ message: "handle taken" }, 400),
    })
    const res = await put({ handle: "taken.test" })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "handle taken" })
    expect(invalidateDidDoc).not.toHaveBeenCalled()
  })

  it("400s when handle is missing", async () => {
    const res = await put({})
    expect(res.status).toBe(400)
    expect(callPds).not.toHaveBeenCalled()
    expect(invalidateDidDoc).not.toHaveBeenCalled()
  })

  it("400s when handle is blank after trim", async () => {
    const res = await put({ handle: "   " })
    expect(res.status).toBe(400)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("400s when handle exceeds 253 chars", async () => {
    const res = await put({ handle: `${"a".repeat(254)}` })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: "Handle too long (max 253 characters)",
    })
    expect(callPds).not.toHaveBeenCalled()
  })

  it("accepts a handle of exactly 253 chars", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({}),
    })
    const handle = "a".repeat(253)
    const res = await put({ handle })
    expect(res.status).toBe(200)
    expect(callPds).toHaveBeenCalledWith(
      "did:plc:alice",
      GROUP_DID,
      "com.atproto.identity.updateHandle",
      { method: "POST", body: { handle } },
    )
  })

  it("401s when there is no session", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const res = await put({ handle: "newgroup.test" })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Not authenticated" })
    expect(callPds).not.toHaveBeenCalled()
  })

  it("400s when the group DID is invalid", async () => {
    const res = await put({ handle: "newgroup.test" }, "not-a-did")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid group DID" })
    expect(callPds).not.toHaveBeenCalled()
  })

  it("returns the CSRF response when the origin check fails", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await put({ handle: "newgroup.test" })
    expect(res.status).toBe(403)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("429s when the limiter denies the request", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 }) as never,
    )
    const res = await put({ handle: "newgroup.test" })
    expect(res.status).toBe(429)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("enforces gate ORDER: rate-limit before CSRF (429 wins when both fail)", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 }) as never,
    )
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await put({ handle: "newgroup.test" })
    expect(res.status).toBe(429)
    expect(callPds).not.toHaveBeenCalled()
  })
})
