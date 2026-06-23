import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the list/create (`/api/account/app-passwords`) and revoke
 * (`/api/account/app-passwords/revoke`) routes.
 *
 * `callPds` is mocked to return either `locked` or a stubbed PDS `response`,
 * so we assert: locked → `401 { error: "locked" }`; success shapes; the
 * auth / CSRF / validation gates. The `callPds` helper itself is unit-tested
 * separately.
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

function makeRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", origin: "https://example.test" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

const BASE = "https://example.test/api/account/app-passwords"

async function getList(): Promise<Response> {
  const { GET } = await import("../route")
  return GET()
}
async function postCreate(body?: unknown): Promise<Response> {
  const { POST } = await import("../route")
  return POST(makeRequest(BASE, "POST", body) as unknown as Parameters<typeof POST>[0])
}
async function postRevoke(body?: unknown): Promise<Response> {
  const { POST } = await import("../revoke/route")
  return POST(
    makeRequest(`${BASE}/revoke`, "POST", body) as unknown as Parameters<
      typeof POST
    >[0],
  )
}

beforeEach(() => {
  // mockReset (not just mockResolvedValue) so a leftover `…ValueOnce` set by a
  // test that short-circuited before consuming it can't leak into the next.
  vi.mocked(getSessionDid).mockReset().mockResolvedValue("did:plc:alice")
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(null)
  vi.mocked(callPds).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GET (list)", () => {
  it("401 { error: 'locked' } when the session is locked", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({ kind: "locked" })
    const res = await getList()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "locked" })
  })

  it("returns the password list on success", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({
        passwords: [{ name: "client-a", createdAt: "2026-01-01T00:00:00Z" }],
      }),
    })
    const res = await getList()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      passwords: [{ name: "client-a", createdAt: "2026-01-01T00:00:00Z" }],
    })
  })

  it("401s (not locked) when there is no session at all", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const res = await getList()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Not authenticated" })
    expect(callPds).not.toHaveBeenCalled()
  })

  it("502 when the PDS list call fails (non-401)", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({ error: "boom" }, 500),
    })
    const res = await getList()
    expect(res.status).toBe(502)
  })
})

describe("POST (create)", () => {
  it("401 locked when the session is locked", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({ kind: "locked" })
    const res = await postCreate({ name: "my-client" })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "locked" })
  })

  it("returns the one-time secret on success", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({
        name: "my-client",
        password: "abcd-efgh-ijkl-mnop",
        createdAt: "2026-01-01T00:00:00Z",
      }),
    })
    const res = await postCreate({ name: "my-client" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.password).toBe("abcd-efgh-ijkl-mnop")
    expect(callPds).toHaveBeenCalledWith(
      "did:plc:alice",
      "com.atproto.server.createAppPassword",
      { method: "POST", body: { name: "my-client" } },
    )
  })

  it("trims the name before forwarding", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({ name: "x", password: "p", createdAt: "t" }),
    })
    await postCreate({ name: "  spaced  " })
    expect(callPds).toHaveBeenCalledWith(
      "did:plc:alice",
      "com.atproto.server.createAppPassword",
      { method: "POST", body: { name: "spaced" } },
    )
  })

  it("400s when name is missing", async () => {
    const res = await postCreate({})
    expect(res.status).toBe(400)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("400s when name is blank after trim", async () => {
    const res = await postCreate({ name: "   " })
    expect(res.status).toBe(400)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("forwards a structured upstream conflict", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse(
        { error: "AppPasswordExists", message: "Name already in use" },
        409,
      ),
    })
    const res = await postCreate({ name: "dup" })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Name already in use" })
  })

  it("returns the CSRF response when the origin check fails", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await postCreate({ name: "my-client" })
    expect(res.status).toBe(403)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("429s when the limiter denies the request", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 }) as never,
    )
    const res = await postCreate({ name: "my-client" })
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
    const res = await postCreate({ name: "my-client" })
    expect(res.status).toBe(429)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("never writes the one-time secret to the logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const secret = "abcd-efgh-ijkl-mnop"
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({
        name: "my-client",
        password: secret,
        createdAt: "2026-01-01T00:00:00Z",
      }),
    })
    const res = await postCreate({ name: "my-client" })
    expect(res.status).toBe(200)
    // The secret goes to the client but must never reach a logger — note the
    // app-password secret is NOT a JWT/email shape, so redactSecrets would
    // not scrub it; the guarantee is that the route simply never logs it.
    const logged = spy.mock.calls.map((c) => JSON.stringify(c)).join(" ")
    expect(logged).not.toContain(secret)
    spy.mockRestore()
  })
})

describe("POST /revoke", () => {
  it("401 locked when the session is locked", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({ kind: "locked" })
    const res = await postRevoke({ name: "my-client" })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "locked" })
  })

  it("returns ok on success", async () => {
    vi.mocked(callPds).mockResolvedValueOnce({
      kind: "ok",
      response: jsonResponse({}),
    })
    const res = await postRevoke({ name: "my-client" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(callPds).toHaveBeenCalledWith(
      "did:plc:alice",
      "com.atproto.server.revokeAppPassword",
      { method: "POST", body: { name: "my-client" } },
    )
  })

  it("400s when name is missing", async () => {
    const res = await postRevoke({})
    expect(res.status).toBe(400)
    expect(callPds).not.toHaveBeenCalled()
  })

  it("returns the CSRF response when the origin check fails", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await postRevoke({ name: "my-client" })
    expect(res.status).toBe(403)
    expect(callPds).not.toHaveBeenCalled()
  })
})
