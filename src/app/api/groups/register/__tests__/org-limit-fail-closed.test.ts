import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the groups/register org-limit fail-closed contract.
 *
 * The limit check paginates CGS membership.list; a non-ok page used to be
 * treated as end-of-pagination, silently truncating the list, zeroing the
 * self-created count, and waving a user already at the cap through while
 * group.register still succeeded (fail-open). The route must instead fail
 * CLOSED — same 503 the surrounding catch returns when the check throws —
 * and never reach the register call.
 *
 * The route pulls in server-only deps (OAuth client, session, atproto
 * Agent) at import time, so we mock those, mirroring the sibling
 * org-limit test files.
 */

vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  makeLimiter: vi.fn(() => ({})),
}))
vi.mock("@/lib/groups/proxy-agent", () => ({
  getAuthenticatedAgent: vi.fn(),
  getServiceAuthToken: vi.fn(async () => "register-token"),
  createGroupClient: vi.fn(),
}))

import { getAuthenticatedAgent } from "@/lib/groups/proxy-agent"

const OWNER_DID = "did:plc:owner"

function makeRequest() {
  return new Request("https://example.test/api/groups/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: "owner.test", ownerDid: OWNER_DID }),
  })
}

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

beforeEach(() => {
  vi.clearAllMocks()
  // The 503 path logs via logSafe (console.error); keep output clean.
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("groups/register org-limit check fails closed on a non-ok membership.list", () => {
  it("returns 503 and never calls group.register when membership.list 500s", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(makeAuth())

    const registerCalls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url.includes("membership.list")) {
          return new Response("upstream down", { status: 500 })
        }
        if (url.includes("group.register")) {
          registerCalls.push(url)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        throw new Error(`unexpected fetch: ${url}`)
      })
    )

    const { POST } = await import("../route")
    const res = await POST(makeRequest() as never)

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain("Unable to verify group creation limit")
    expect(registerCalls).toHaveLength(0)
  })

  it("still registers when membership.list paginates cleanly", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(makeAuth())

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url.includes("membership.list")) {
          return new Response(JSON.stringify({ groups: [] }), { status: 200 })
        }
        if (url.includes("group.register")) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        throw new Error(`unexpected fetch: ${url}`)
      })
    )

    const { POST } = await import("../route")
    const res = await POST(makeRequest() as never)

    expect(res.status).toBe(200)
  })
})
