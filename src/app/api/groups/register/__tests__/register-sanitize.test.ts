import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the groups/register boundary-sanitization fix (risk-004).
 *
 * AGENTS.md §17.6/§24.5 mandate sanitizing untrusted input at the server
 * boundary even when the client also sanitizes. The route must:
 *   - run `sanitizeHandle` on the client-supplied handle (stripping invisible
 *     chars / whitespace / leading @) and re-check the 253-char cap on the
 *     RESULT before forwarding it to the group service;
 *   - validate the optional email (feedback/route.ts's regex + 254-char cap)
 *     and reject (or omit) it on failure.
 *
 * The route pulls in server-only deps (OAuth client, session, atproto Agent)
 * at import time, so we mock those and drive the POST handler down to the
 * final `fetch` to `app.certified.group.register`, then inspect the
 * forwarded body.
 */

vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  makeLimiter: vi.fn(() => ({})),
}))
vi.mock("@/lib/groups/proxy-agent", () => ({
  getAuthenticatedAgent: vi.fn(),
  getServiceAuthToken: vi.fn(async () => "register-token"),
  createGroupAgent: vi.fn(),
}))

import { getAuthenticatedAgent } from "@/lib/groups/proxy-agent"

const OWNER_DID = "did:plc:owner"

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://example.test/api/groups/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// Auth whose org-limit membership list resolves to zero groups, so the
// handler always reaches the final register fetch.
function makeAuth() {
  return {
    did: OWNER_DID,
    agent: {
      com: {
        atproto: {
          server: {
            getServiceAuth: vi.fn(async () => ({
              data: { token: "membership-token" },
            })),
          },
        },
      },
    },
  } as unknown as Awaited<ReturnType<typeof getAuthenticatedAgent>>
}

/**
 * Install a global fetch that returns an empty membership list for the
 * org-limit check and a 200 success for the register call. Returns the array
 * of captured register-call request bodies.
 */
function installFetch(): { registerBodies: Record<string, unknown>[] } {
  const registerBodies: Record<string, unknown>[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.includes("membership.list")) {
        return new Response(JSON.stringify({ groups: [] }), { status: 200 })
      }
      if (url.includes("group.register")) {
        registerBodies.push(JSON.parse((init?.body as string) ?? "{}"))
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
  )
  return { registerBodies }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("groups/register boundary sanitization (risk-004)", () => {
  it("strips invisible chars from the handle before forwarding", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(makeAuth())
    const { registerBodies } = installFetch()

    const { POST } = await import("../route")
    // Zero-width space (U+200B) embedded in the handle, plus a leading @.
    const res = await POST(
      makeRequest({ handle: "@own​er.test", ownerDid: OWNER_DID }) as never
    )

    expect(res.status).toBe(200)
    expect(registerBodies).toHaveLength(1)
    // sanitizeHandle removes the ZWSP and the leading @.
    expect(registerBodies[0].handle).toBe("owner.test")
  })

  it("re-checks the 253 cap on the SANITIZED handle", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(makeAuth())
    const { registerBodies } = installFetch()

    const { POST } = await import("../route")
    // 253 visible chars is at the limit; padding it with invisible chars
    // must not let an over-length sanitized handle through. The sanitized
    // result here is exactly 253, so it should be accepted.
    const exactly253 = "a".repeat(253)
    const res = await POST(
      makeRequest({
        handle: `${exactly253}​`,
        ownerDid: OWNER_DID,
      }) as never
    )

    expect(res.status).toBe(200)
    expect(registerBodies[0].handle).toBe(exactly253)

    // A sanitized handle of 254 chars must be rejected even though the raw
    // string only crossed 253 with a trailing strippable char.
    const { registerBodies: bodies2 } = installFetch()
    const exactly254 = "a".repeat(254)
    const res2 = await POST(
      makeRequest({ handle: exactly254, ownerDid: OWNER_DID }) as never
    )
    expect(res2.status).toBe(400)
    expect(bodies2).toHaveLength(0)
  })

  it("rejects or omits an invalid email", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(makeAuth())
    const { registerBodies } = installFetch()

    const { POST } = await import("../route")
    const res = await POST(
      makeRequest({
        handle: "owner.test",
        ownerDid: OWNER_DID,
        email: "not-an-email",
      }) as never
    )

    if (res.status === 400) {
      // Rejected outright — nothing forwarded.
      expect(registerBodies).toHaveLength(0)
    } else {
      // Accepted but the bad email must NOT be forwarded.
      expect(res.status).toBe(200)
      expect(registerBodies).toHaveLength(1)
      expect(registerBodies[0].email).toBeUndefined()
    }
  })

  it("forwards a valid email unchanged", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(makeAuth())
    const { registerBodies } = installFetch()

    const { POST } = await import("../route")
    const res = await POST(
      makeRequest({
        handle: "owner.test",
        ownerDid: OWNER_DID,
        email: "owner@example.com",
      }) as never
    )

    expect(res.status).toBe(200)
    expect(registerBodies[0].email).toBe("owner@example.com")
  })
})
