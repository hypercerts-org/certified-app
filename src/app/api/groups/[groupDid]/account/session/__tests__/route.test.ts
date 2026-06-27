import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the elevated GROUP-account unlock/lock route
 * (`POST`/`DELETE` /api/groups/[groupDid]/account/session).
 *
 * Drives the route with the auth / CSRF / rate-limit / session-helper seams
 * mocked, so we assert the gate order (auth → DID validity → rate-limit →
 * CSRF → parse → execute) and the discriminated unlock mapping in isolation.
 * The `establish` / `end` helpers have their own unit suite.
 */

vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  makeLimiter: vi.fn(() => ({})),
  checkHttpRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 9,
    resetAt: 0,
  })),
  rateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "rl" }), { status: 429 }),
  ),
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(async () => "did:plc:alice"),
}))
vi.mock("@/lib/auth/group-account-session", () => ({
  establish: vi.fn(),
  end: vi.fn(async () => undefined),
}))

import { checkCsrf } from "@/lib/auth/csrf"
import {
  checkHttpRateLimit,
  enforceRateLimit,
  rateLimitResponse,
} from "@/lib/auth/rate-limit"
import { getSessionDid } from "@/lib/auth/session"
import { establish, end } from "@/lib/auth/group-account-session"

const GROUP_DID = "did:plc:abcdefghijklmnopqrstuvwx"

function makeRequest(method: string, body?: unknown): Request {
  return new Request(
    `https://example.test/api/groups/${GROUP_DID}/account/session`,
    {
      method,
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

async function post(body?: unknown, groupDid = GROUP_DID): Promise<Response> {
  const { POST } = await import("../route")
  return POST(
    makeRequest("POST", body) as unknown as Parameters<typeof POST>[0],
    makeContext(groupDid) as unknown as Parameters<typeof POST>[1],
  )
}

async function del(groupDid = GROUP_DID): Promise<Response> {
  const { DELETE } = await import("../route")
  return DELETE(
    makeRequest("DELETE") as unknown as Parameters<typeof DELETE>[0],
    makeContext(groupDid) as unknown as Parameters<typeof DELETE>[1],
  )
}

beforeEach(() => {
  vi.mocked(getSessionDid).mockReset().mockResolvedValue("did:plc:alice")
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  vi.mocked(checkHttpRateLimit).mockReset().mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: 0,
  })
  vi.mocked(rateLimitResponse)
    .mockReset()
    .mockImplementation(
      () =>
        new Response(JSON.stringify({ error: "rl" }), { status: 429 }) as never,
    )
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(null)
  vi.mocked(establish).mockReset()
  vi.mocked(end).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /session (unlock)", () => {
  it("returns { status: 'ok' } on a successful unlock", async () => {
    vi.mocked(establish).mockResolvedValueOnce({ status: "ok" })
    const res = await post({ password: "hunter2" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "ok" })
    expect(establish).toHaveBeenCalledWith(
      "did:plc:alice",
      GROUP_DID,
      "hunter2",
      undefined,
    )
  })

  it("passes through twoFactorRequired", async () => {
    vi.mocked(establish).mockResolvedValueOnce({ status: "twoFactorRequired" })
    const res = await post({ password: "hunter2" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "twoFactorRequired" })
  })

  it("forwards authFactorToken when present", async () => {
    vi.mocked(establish).mockResolvedValueOnce({ status: "ok" })
    await post({ password: "hunter2", authFactorToken: "123456" })
    expect(establish).toHaveBeenCalledWith(
      "did:plc:alice",
      GROUP_DID,
      "hunter2",
      "123456",
    )
  })

  it("400s when password is missing", async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    expect(establish).not.toHaveBeenCalled()
  })

  it("400s when authFactorToken is the wrong type", async () => {
    const res = await post({ password: "hunter2", authFactorToken: 123 })
    expect(res.status).toBe(400)
    expect(establish).not.toHaveBeenCalled()
  })

  it("400s when authFactorToken is too long", async () => {
    const res = await post({
      password: "hunter2",
      authFactorToken: "x".repeat(257),
    })
    expect(res.status).toBe(400)
    expect(establish).not.toHaveBeenCalled()
  })

  it("401s when there is no session", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const res = await post({ password: "hunter2" })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Not authenticated" })
    expect(establish).not.toHaveBeenCalled()
  })

  it("400s when the group DID is invalid", async () => {
    const res = await post({ password: "hunter2" }, "not-a-did")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid group DID" })
    expect(establish).not.toHaveBeenCalled()
  })

  it("returns a 429 when the limiter denies the request", async () => {
    vi.mocked(checkHttpRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: 0,
    })
    const res = await post({ password: "hunter2" })
    expect(res.status).toBe(429)
    expect(establish).not.toHaveBeenCalled()
  })

  it("fails CLOSED (503) when the limiter throws — never silently allows a guess", async () => {
    vi.mocked(checkHttpRateLimit).mockRejectedValueOnce(new Error("redis down"))
    const res = await post({ password: "hunter2" })
    expect(res.status).toBe(503)
    expect(establish).not.toHaveBeenCalled()
  })

  it("returns the CSRF response when the origin check fails", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await post({ password: "hunter2" })
    expect(res.status).toBe(403)
    expect(establish).not.toHaveBeenCalled()
  })

  it("enforces gate ORDER: rate-limit runs before CSRF (429 wins when both fail)", async () => {
    vi.mocked(checkHttpRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: 0,
    })
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await post({ password: "hunter2" })
    expect(res.status).toBe(429)
    expect(establish).not.toHaveBeenCalled()
  })

  it("enforces gate ORDER: auth runs before rate-limit (401 when both fail)", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    vi.mocked(checkHttpRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: 0,
    })
    const res = await post({ password: "hunter2" })
    expect(res.status).toBe(401)
    expect(checkHttpRateLimit).not.toHaveBeenCalled()
    expect(establish).not.toHaveBeenCalled()
  })

  it("enforces gate ORDER: DID validity runs before rate-limit (400 when both would fail)", async () => {
    vi.mocked(checkHttpRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: 0,
    })
    const res = await post({ password: "hunter2" }, "not-a-did")
    expect(res.status).toBe(400)
    expect(checkHttpRateLimit).not.toHaveBeenCalled()
  })
})

describe("DELETE /session (lock)", () => {
  it("ends the session and returns ok", async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(end).toHaveBeenCalledWith("did:plc:alice", GROUP_DID)
  })

  it("401s when there is no session", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const res = await del()
    expect(res.status).toBe(401)
    expect(end).not.toHaveBeenCalled()
  })

  it("400s when the group DID is invalid", async () => {
    const res = await del("not-a-did")
    expect(res.status).toBe(400)
    expect(end).not.toHaveBeenCalled()
  })

  it("returns the CSRF response when the origin check fails", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await del()
    expect(res.status).toBe(403)
    expect(end).not.toHaveBeenCalled()
  })

  it("429s when the limiter denies the request", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 }) as never,
    )
    const res = await del()
    expect(res.status).toBe(429)
    expect(end).not.toHaveBeenCalled()
  })
})
