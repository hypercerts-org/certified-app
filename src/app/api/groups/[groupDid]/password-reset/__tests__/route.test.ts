import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Cross-account safety for the group password-reset route
 * (`POST`/`PUT` /api/groups/[groupDid]/password-reset).
 *
 * The route is deliberately an *unauthenticated-recovery* relay: the caller
 * supplies an email and the app runs atproto's standard `requestPasswordReset`
 * / `resetPassword` against the GROUP's PDS. Because a reset token carries no
 * DID, an attacker could enter a DIFFERENT account's email and complete a reset
 * that never touches the named group. The safety invariant that stops that from
 * being reported as a success is the PUT verify step (route.ts:139): after
 * `resetPassword`, the route logs in *as the group DID* with the new password
 * and only reports success if that login works (or surfaces
 * AuthFactorTokenRequired, i.e. a correct password on a 2FA group). If the
 * reset landed on some other account, the group login fails and the route
 * returns 409 — never claiming the group was reset.
 *
 * These tests assert that invariant plus the gate (signed-in + rate-limit +
 * CSRF) that keeps the route from being an open reset-spam relay.
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
  resolvePdsUrl: vi.fn(async () => "https://pds.test"),
}))

import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit } from "@/lib/auth/rate-limit"
import { getSessionDid } from "@/lib/auth/session"
import { resolvePdsUrl } from "@/lib/atproto/did"

const GROUP_DID = "did:plc:abcdefghijklmnopqrstuvwx"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request(
    `https://example.test/api/groups/${GROUP_DID}/password-reset`,
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

async function put(body?: unknown, groupDid = GROUP_DID): Promise<Response> {
  const { PUT } = await import("../route")
  return PUT(
    makeRequest("PUT", body) as unknown as Parameters<typeof PUT>[0],
    makeContext(groupDid) as unknown as Parameters<typeof PUT>[1],
  )
}

/**
 * Route upstream `fetch`es by NSID so each PUT step (resetPassword →
 * createSession verify → deleteSession cleanup) can be controlled and asserted
 * independently. Returns the spy so callers can inspect the createSession body.
 */
function stubFetch(handlers: {
  requestPasswordReset?: () => Response
  resetPassword?: () => Response
  createSession?: () => Response
  deleteSession?: () => Response
}) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes("requestPasswordReset"))
        return (handlers.requestPasswordReset ?? (() => jsonResponse({})))()
      if (url.includes("resetPassword"))
        return (handlers.resetPassword ?? (() => jsonResponse({})))()
      if (url.includes("createSession"))
        return (handlers.createSession ?? (() => jsonResponse({})))()
      if (url.includes("deleteSession"))
        return (handlers.deleteSession ?? (() => jsonResponse({})))()
      throw new Error(`unexpected fetch: ${url}`)
    })
}

beforeEach(() => {
  vi.mocked(getSessionDid).mockReset().mockResolvedValue("did:plc:alice")
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(null)
  vi.mocked(resolvePdsUrl).mockReset().mockResolvedValue("https://pds.test")
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PUT /password-reset — cross-account safety (verify against the group)", () => {
  it("verifies the reset by logging in AS THE GROUP DID (not the caller)", async () => {
    const fetchSpy = stubFetch({
      resetPassword: () => jsonResponse({}),
      createSession: () => jsonResponse({ refreshJwt: "r-token" }),
      deleteSession: () => jsonResponse({}),
    })
    const res = await put({ token: "code123", password: "newpass!!" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    // The confirmation login is issued with `identifier: groupDid` — this is
    // what ties the "success" answer to the named group and prevents a reset of
    // some other account (via a foreign email) from ever being reported as a
    // successful group reset.
    const createSessionCall = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes("createSession"),
    )
    expect(createSessionCall).toBeDefined()
    const verifyBody = JSON.parse(
      (createSessionCall![1] as { body: string }).body,
    )
    expect(verifyBody.identifier).toBe(GROUP_DID)
    expect(verifyBody.password).toBe("newpass!!")
  })

  it("returns 409 (NOT success) when the reset applied to a different account — the group login fails", async () => {
    // resetPassword succeeded, but createSession against the group DID with the
    // new password is rejected → the token belonged to a different account, so
    // the group's password is unchanged. The route must refuse to claim success.
    const fetchSpy = stubFetch({
      resetPassword: () => jsonResponse({}),
      createSession: () =>
        jsonResponse({ error: "AuthenticationRequired" }, 401),
    })
    const res = await put({ token: "code123", password: "newpass!!" })

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain("different account")
    // No throwaway session existed, so no cleanup tear-down was attempted.
    expect(
      fetchSpy.mock.calls.some((c) => String(c[0]).includes("deleteSession")),
    ).toBe(false)
  })

  it("treats AuthFactorTokenRequired as confirmation (correct password on a 2FA group)", async () => {
    stubFetch({
      resetPassword: () => jsonResponse({}),
      createSession: () =>
        jsonResponse({ error: "AuthFactorTokenRequired" }, 401),
    })
    const res = await put({ token: "code123", password: "newpass!!" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it("forwards the upstream failure and never reaches the group-verify step when resetPassword fails", async () => {
    const fetchSpy = stubFetch({
      resetPassword: () => jsonResponse({ message: "Invalid token" }, 400),
    })
    const res = await put({ token: "wrong", password: "newpass!!" })
    expect(res.status).toBe(400)
    expect(
      fetchSpy.mock.calls.some((c) => String(c[0]).includes("createSession")),
    ).toBe(false)
  })

  it("401s without a session and issues NO upstream request", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const fetchSpy = stubFetch({})
    const res = await put({ token: "code123", password: "newpass!!" })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Not authenticated" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("returns the CSRF response and issues NO upstream request", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const fetchSpy = stubFetch({})
    const res = await put({ token: "code123", password: "newpass!!" })
    expect(res.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("429s when the caller limiter denies, before any upstream request", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 }) as never,
    )
    const fetchSpy = stubFetch({})
    const res = await put({ token: "code123", password: "newpass!!" })
    expect(res.status).toBe(429)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("400s on an invalid group DID and issues NO upstream request", async () => {
    const fetchSpy = stubFetch({})
    const res = await put({ token: "code123", password: "newpass!!" }, "nope")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid group DID" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("400s when the reset code or password is missing", async () => {
    const fetchSpy = stubFetch({})
    const res = await put({ token: "code123" })
    expect(res.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("POST /password-reset — email-gated recovery relay to the group's PDS", () => {
  it("relays requestPasswordReset to the resolved GROUP PDS with the supplied email", async () => {
    const fetchSpy = stubFetch({ requestPasswordReset: () => jsonResponse({}) })
    const res = await post({ email: "  ops@group.test  " })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    const call = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes("requestPasswordReset"),
    )
    expect(String(call![0])).toBe(
      "https://pds.test/xrpc/com.atproto.server.requestPasswordReset",
    )
    const body = JSON.parse((call![1] as { body: string }).body)
    expect(body.email).toBe("ops@group.test")
  })

  it("401s without a session and issues NO upstream request", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const fetchSpy = stubFetch({})
    const res = await post({ email: "ops@group.test" })
    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("400s when the email is missing", async () => {
    const fetchSpy = stubFetch({})
    const res = await post({})
    expect(res.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("502s when the group's PDS cannot be resolved", async () => {
    vi.mocked(resolvePdsUrl).mockResolvedValueOnce(null)
    const fetchSpy = stubFetch({})
    const res = await post({ email: "ops@group.test" })
    expect(res.status).toBe(502)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
