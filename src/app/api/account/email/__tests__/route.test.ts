import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the user-account email route
 * (`GET`/`POST`/`PUT` /api/account/email).
 *
 * `callPds` (the elevated password session) is mocked to return either
 * `locked` or a stubbed PDS `response`, so we assert: locked →
 * `401 { error: "locked" }`; success shapes; upstream error forwarding; and the
 * auth / rate-limit / CSRF / validation gates. The `callPds` helper itself is
 * unit-tested separately.
 */

vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  makeLimiter: vi.fn(() => ({})),
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(async () => "did:plc:alice"),
}))
vi.mock("@/lib/auth/app-password-session", () => ({
  callPds: vi.fn(),
}))

import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit } from "@/lib/auth/rate-limit"
import { getSessionDid } from "@/lib/auth/session"
import { callPds } from "@/lib/auth/app-password-session"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request("https://example.test/api/account/email", {
    method,
    headers: {
      "Content-Type": "application/json",
      origin: "https://example.test",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function get(): Promise<Response> {
  const { GET } = await import("../route")
  return GET()
}

async function post(): Promise<Response> {
  const { POST } = await import("../route")
  return POST(makeRequest("POST") as unknown as Parameters<typeof POST>[0])
}

async function put(body?: unknown): Promise<Response> {
  const { PUT } = await import("../route")
  return PUT(makeRequest("PUT", body) as unknown as Parameters<typeof PUT>[0])
}

beforeEach(() => {
  vi.mocked(getSessionDid).mockReset().mockResolvedValue("did:plc:alice")
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(null)
  vi.mocked(callPds).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GET (read email)", () => {
  it("returns email + emailConfirmed on success", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({
        email: "alice@example.com",
        emailConfirmed: true,
      }),
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      email: "alice@example.com",
      emailConfirmed: true,
    })
    expect(callPds).toHaveBeenCalledWith(
      "did:plc:alice",
      "com.atproto.server.getSession",
    )
  })

  it("normalizes a missing email to null and emailConfirmed to false", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({}),
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email: null, emailConfirmed: false })
  })

  it("401 { error: 'locked' } when the session is locked", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({ kind: "locked" })
    const res = await get()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "locked" })
  })

  it("401 (not locked) when there is no session at all", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const res = await get()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Not authenticated" })
    expect(callPds).not.toHaveBeenCalled()
  })

  it("429s when the limiter denies the request", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 }) as never,
    )
    const res = await get()
    expect(res.status).toBe(429)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("forwards the upstream status + message when the PDS read fails", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({ message: "boom" }, 502),
    })
    const res = await get()
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: "boom" })
  })
})

describe("POST (request email update)", () => {
  it("returns { tokenRequired } on success", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({ tokenRequired: true }),
    })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tokenRequired: true })
    expect(callPds).toHaveBeenCalledWith(
      "did:plc:alice",
      "com.atproto.server.requestEmailUpdate",
      { method: "POST" },
    )
  })

  it("normalizes a missing tokenRequired to false", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({}),
    })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tokenRequired: false })
  })

  it("401 locked when the session is locked", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({ kind: "locked" })
    const res = await post()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "locked" })
  })

  it("401 (not locked) when there is no session at all", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const res = await post()
    expect(res.status).toBe(401)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("returns the CSRF response when the origin check fails", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await post()
    expect(res.status).toBe(403)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("enforces gate ORDER: rate-limit before CSRF (429 wins when both fail)", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 }) as never,
    )
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await post()
    expect(res.status).toBe(429)
    expect(callPds).not.toHaveBeenCalled()
  })
})

describe("PUT (update email)", () => {
  it("trims the email and forwards updateEmail on success", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({}),
    })
    const res = await put({ email: "  new@example.com  " })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(callPds).toHaveBeenCalledWith(
      "did:plc:alice",
      "com.atproto.server.updateEmail",
      { method: "POST", body: { email: "new@example.com" } },
    )
  })

  it("forwards a trimmed token when present", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({}),
    })
    await put({ email: "new@example.com", token: "  123456  " })
    expect(callPds).toHaveBeenCalledWith(
      "did:plc:alice",
      "com.atproto.server.updateEmail",
      { method: "POST", body: { email: "new@example.com", token: "123456" } },
    )
  })

  it("401 locked when the session is locked", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({ kind: "locked" })
    const res = await put({ email: "new@example.com" })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "locked" })
  })

  it("400s when email is missing", async () => {
    const res = await put({})
    expect(res.status).toBe(400)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("400s when email is blank after trim", async () => {
    const res = await put({ email: "   " })
    expect(res.status).toBe(400)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("401 (not locked) when there is no session at all", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const res = await put({ email: "new@example.com" })
    expect(res.status).toBe(401)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("returns the CSRF response when the origin check fails", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await put({ email: "new@example.com" })
    expect(res.status).toBe(403)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("forwards the upstream status + message when updateEmail fails", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse(
        { error: "TokenInvalid", message: "bad token" },
        400,
      ),
    })
    const res = await put({ email: "new@example.com", token: "000000" })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "bad token" })
  })
})
