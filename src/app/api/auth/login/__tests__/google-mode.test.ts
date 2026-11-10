import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Google sign-in through the Certified ePDS (epds-login skill, "Google
 * Sign-In"). `epds_social_provider=google` must land on the returned
 * authorization URL, never in the PAR request that `client.authorize`
 * builds from its options. That is the same split as an email
 * `login_hint`: ePDS reads it from the browser authorize URL only.
 */

const authorize = vi.fn()

vi.mock("@/lib/auth/oauth-client", () => ({
  getOAuthClient: vi.fn(async () => ({ authorize })),
  PDS_URL: "https://pds.example.test",
}))
vi.mock("@/lib/auth/session", () => ({ getSessionDid: vi.fn(async () => null) }))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  makeLimiter: () => ({}),
}))
vi.mock("@/lib/utils/log-safe", () => ({ logSafe: vi.fn() }))

function post(body: unknown): NextRequest {
  return new NextRequest("https://app.example.test/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://app.example.test",
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  authorize.mockReset()
  authorize.mockImplementation(
    async () =>
      new URL("https://auth.example.test/oauth/authorize?client_id=c&request_uri=r"),
  )
})

describe("POST /api/auth/login mode=google", () => {
  it("authorizes against the Certified ePDS and adds epds_social_provider to the URL", async () => {
    const { POST } = await import("../route")

    // A caller-supplied prompt must not be mirrored onto the URL either.
    const res = await POST(post({ mode: "google", prompt: "login" }))

    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    const params = new URL(url).searchParams
    expect(params.get("epds_social_provider")).toBe("google")
    expect(params.get("request_uri")).toBe("r")
    expect(params.has("login_hint")).toBe(false)
    expect(params.has("prompt")).toBe(false)
  })

  it("keeps the provider out of the PAR options", async () => {
    const { POST } = await import("../route")

    await POST(post({ mode: "google", prompt: "login" }))

    expect(authorize).toHaveBeenCalledTimes(1)
    const [target, options] = authorize.mock.calls[0] as [string, Record<string, unknown>]
    expect(target).toBe("https://pds.example.test")
    expect(options).toEqual({
      scope: "atproto transition:generic identity:handle account:email",
    })
  })

  it("still rejects unknown modes", async () => {
    const { POST } = await import("../route")

    const res = await POST(post({ mode: "facebook" }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid mode" })
    expect(authorize).not.toHaveBeenCalled()
  })
})
