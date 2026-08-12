import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the feedback relay route (`POST /api/feedback`).
 *
 * The security invariant under test (`sec-feedback-email-relay`): the endpoint
 * must never deliver an email to a request-supplied recipient, because both the
 * recipient `email` and the `message` body are attacker-controllable and not
 * tied to the authenticated account. Only the internal notification to the
 * fixed support address may be sent; the caller-supplied email may ride along
 * as an identity line + Reply-To, never as a `to:` recipient.
 */

// Set before the route module is (dynamically) imported so its module-scope
// `resend` client is constructed rather than left null.
process.env.RESEND_API_KEY = "test-key"

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(async () => null),
}))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimitMulti: vi.fn(async () => null),
  makeLimiter: vi.fn(() => ({})),
}))
vi.mock("@/lib/utils/ip", () => ({ clientIp: vi.fn(() => "1.2.3.4") }))

import { checkCsrf } from "@/lib/auth/csrf"
import { getSessionDid } from "@/lib/auth/session"
import { enforceRateLimitMulti } from "@/lib/auth/rate-limit"

const SUPPORT_EMAIL = "support@hypercerts.org"
const VICTIM_EMAIL = "victim@corp.example"

function makeRequest(body: unknown): Request {
  return new Request("https://example.test/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://example.test",
    },
    body: JSON.stringify(body),
  })
}

async function post(body: unknown): Promise<Response> {
  const { POST } = await import("../route")
  return POST(makeRequest(body) as unknown as Parameters<typeof POST>[0])
}

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ id: "email-1" })
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  vi.mocked(getSessionDid).mockReset().mockResolvedValue(null)
  vi.mocked(enforceRateLimitMulti).mockReset().mockResolvedValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /api/feedback", () => {
  it("never sends an email to a request-supplied recipient address", async () => {
    const res = await post({
      message: "Your Certified account needs re-verification: https://evil.example",
      email: VICTIM_EMAIL,
    })
    expect(res.status).toBe(200)

    // Exactly one email is sent — the internal team notification — and every
    // send targets only the fixed support address, never the caller's email.
    expect(sendMock).toHaveBeenCalledTimes(1)
    for (const call of sendMock.mock.calls) {
      expect(call[0].to).toBe(SUPPORT_EMAIL)
      expect(call[0].to).not.toBe(VICTIM_EMAIL)
    }
  })

  it("uses the caller-supplied email only as Reply-To on the internal mail, never as a recipient", async () => {
    await post({ message: "hello team", email: "user@example.com" })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0][0]
    expect(arg.to).toBe(SUPPORT_EMAIL)
    expect(arg.replyTo).toBe("user@example.com")
    // The internal mail carries the message body; nothing is echoed back to
    // the caller because no second (user-facing) send happens.
    expect(arg.text).toContain("hello team")
  })

  it("sends only the internal notification when no email is supplied", async () => {
    const res = await post({ message: "anonymous note" })
    expect(res.status).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0][0]
    expect(arg.to).toBe(SUPPORT_EMAIL)
    expect(arg.replyTo).toBeUndefined()
  })

  it("does not send any email when the rate limiter denies the request", async () => {
    vi.mocked(enforceRateLimitMulti).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 }) as never,
    )
    const res = await post({ message: "spam", email: VICTIM_EMAIL })
    expect(res.status).toBe(429)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
