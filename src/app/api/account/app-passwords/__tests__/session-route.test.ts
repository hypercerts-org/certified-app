import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the unlock/lock route (`POST`/`DELETE` /api/account/app-passwords/session).
 *
 * Drives the route with the auth / CSRF / rate-limit / session-helper seams
 * mocked, so we assert the gate order and the discriminated unlock mapping in
 * isolation. The `establish` helper has its own unit suite.
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
vi.mock("@/lib/auth/app-password-session", () => ({
  establish: vi.fn(),
  end: vi.fn(async () => undefined),
}))

import { checkCsrf } from "@/lib/auth/csrf"
import { checkHttpRateLimit, rateLimitResponse } from "@/lib/auth/rate-limit"
import { getSessionDid } from "@/lib/auth/session"
import { establish, end } from "@/lib/auth/app-password-session"

function makeRequest(method: string, body?: unknown): Request {
  return new Request("https://example.test/api/account/app-passwords/session", {
    method,
    headers: { "Content-Type": "application/json", origin: "https://example.test" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function post(body?: unknown): Promise<Response> {
  const { POST } = await import("../session/route")
  return POST(makeRequest("POST", body) as unknown as Parameters<typeof POST>[0])
}

async function del(): Promise<Response> {
  const { DELETE } = await import("../session/route")
  return DELETE(makeRequest("DELETE") as unknown as Parameters<typeof DELETE>[0])
}

beforeEach(() => {
  // mockReset (not just mockResolvedValue) so a leftover `…ValueOnce` set by a
  // test that short-circuited before consuming it can't leak into the next.
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
    expect(establish).toHaveBeenCalledWith("did:plc:alice", "hunter2", undefined)
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
    expect(establish).toHaveBeenCalledWith("did:plc:alice", "hunter2", "123456")
  })

  it("maps an invalid password to { status: 'invalid' }", async () => {
    vi.mocked(establish).mockResolvedValueOnce({ status: "invalid" })
    const res = await post({ password: "wrong" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "invalid" })
  })

  it("passes through invalidCode (wrong/expired 2FA code)", async () => {
    vi.mocked(establish).mockResolvedValueOnce({ status: "invalidCode" })
    const res = await post({ password: "hunter2", authFactorToken: "000000" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "invalidCode" })
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

  it("401s when there is no session", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const res = await post({ password: "hunter2" })
    expect(res.status).toBe(401)
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

  it("redacts secrets from a logged upstream error and never logs the password", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    // Simulate an upstream error whose message embeds a credential — the
    // route's logSafe pipeline must scrub it, and the password (a local
    // never handed to a logger) must never appear either.
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.c2lnbmF0dXJl"
    vi.mocked(establish).mockRejectedValueOnce(
      Object.assign(new Error(`upstream rejected token ${jwt}`), { status: 502 }),
    )
    const res = await post({ password: "super-secret-pw" })
    expect(res.status).toBe(502)
    const logged = spy.mock.calls.map((c) => JSON.stringify(c)).join(" ")
    expect(logged).not.toContain(jwt)
    expect(logged).not.toContain("super-secret-pw")
  })
})

describe("DELETE /session (lock)", () => {
  it("ends the session and returns ok", async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(end).toHaveBeenCalledWith("did:plc:alice")
  })

  it("401s when there is no session", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const res = await del()
    expect(res.status).toBe(401)
    expect(end).not.toHaveBeenCalled()
  })
})
