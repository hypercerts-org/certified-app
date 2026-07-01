import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Tests for the groups/register org-creation-limit-check failure path
 * (risk-002). When `getServiceAuth` (an authenticated OAuth/DPoP Agent
 * call) throws, the route must log via `logSafe`, NOT `console.error(…, err)`.
 *
 * The atproto SDK attaches the upstream Request (DPoP proofs + Bearer
 * tokens) on `err.cause`, and stack traces serialize the same Request.
 * `logSafe` drops `.cause`/`.stack` and redacts `.message`; logging the
 * raw `err` would leak those secrets into Vercel logs.
 *
 * The route pulls in server-only deps (OAuth client, session, atproto
 * Agent) at import time, so we mock those. We drive the POST handler down
 * the org-limit catch by making `getServiceAuth` throw a secret-bearing
 * Error, then inspect the emitted `console.error` payload.
 */

vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  makeLimiter: vi.fn(() => ({})),
}))
vi.mock("@/lib/groups/proxy-agent", () => ({
  getAuthenticatedAgent: vi.fn(),
  getServiceAuthToken: vi.fn(),
  createGroupAgent: vi.fn(),
}))

import { getAuthenticatedAgent } from "@/lib/groups/proxy-agent"

const LEAKY_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.s3cr3tSignaturePart"

function makeRequest() {
  return new Request("https://example.test/api/groups/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handle: "owner.test",
      ownerDid: "did:plc:owner",
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("groups/register org-limit check failure logging (risk-002)", () => {
  it("logs via logSafe: redacts the Bearer token and omits cause/stack", async () => {
    // An Error shaped like the atproto SDK ones: secret in .message, the
    // upstream Request on .cause, and the same secret in the stack.
    const leaky = new Error(`getServiceAuth failed Bearer ${LEAKY_TOKEN}`, {
      cause: new Request("https://pds.test/xrpc/foo", {
        headers: { Authorization: `Bearer ${LEAKY_TOKEN}` },
      }),
    })
    leaky.stack = `Error: getServiceAuth failed Bearer ${LEAKY_TOKEN}\n    at <anonymous>`

    const fakeAuth = {
      did: "did:plc:owner",
      agent: {
        com: {
          atproto: {
            server: {
              getServiceAuth: vi.fn(async () => {
                throw leaky
              }),
            },
          },
        },
      },
    } as unknown as Awaited<ReturnType<typeof getAuthenticatedAgent>>
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(fakeAuth)

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    const { POST } = await import("../route")
    const res = await POST(makeRequest() as never)

    // Recommendation keeps the 503.
    expect(res.status).toBe(503)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [prefix, payload] = errorSpy.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ]

    // logSafe emits (prefix, { name, message }). The raw-err path would
    // emit the Error object itself as the second arg.
    expect(typeof prefix).toBe("string")
    expect(payload).toBeTypeOf("object")
    expect(payload).not.toBeInstanceOf(Error)

    const serialized = JSON.stringify({ prefix, payload })
    // No secret leaks anywhere in the emitted log.
    expect(serialized).not.toContain(LEAKY_TOKEN)
    // cause / stack must be dropped entirely.
    expect(payload).not.toHaveProperty("cause")
    expect(payload).not.toHaveProperty("stack")
    expect(serialized.toLowerCase()).not.toContain("pds.test")
  })
})
