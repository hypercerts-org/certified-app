import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

/**
 * `org.hypercerts.funding.receipt` sits in RATE_LIMITED_WRITE_COLLECTIONS,
 * but this BFF route bypasses the xrpc proxy that applies that registry —
 * so group-authored receipts were unlimited (HYPER-575). A receipt names a
 * third party in `from`/`to`, which is why the collection is registered at
 * all: a scripted flood is a reputational attack on someone who never
 * consented to being named.
 *
 * The limiter's own behaviour (429 shaping, fail-open) is covered in
 * `src/lib/auth/__tests__/rate-limit.test.ts`. What matters here is that
 * the route asks about the acting operator and honours the answer.
 */

vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceWriteRateLimit: vi.fn(async () => null),
}))
vi.mock("@/lib/groups/proxy-agent", () => ({
  getAuthenticatedAgent: vi.fn(),
  createGroupClient: vi.fn(),
}))

import { PUT } from "../route"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { enforceWriteRateLimit } from "@/lib/auth/rate-limit"

const GROUP_DID = "did:plc:groupaaaaaaaaaaaaaaaaaaa"
const OPERATOR_DID = "did:plc:operatoraaaaaaaaaaaaaaaa"

const validRecord = {
  to: { did: "did:plc:recipientaaaaaaaaaaaaa" },
  amount: "100",
  currency: "USD",
  occurredAt: "2026-01-01T00:00:00.000Z",
}

function callRoute(body: Record<string, unknown>) {
  const request = new Request("https://example.test/api/groups/x/funding", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return PUT(request as never, {
    params: Promise.resolve({ groupDid: GROUP_DID }),
  })
}

let groupCall: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAuthenticatedAgent).mockResolvedValue({
    did: OPERATOR_DID,
    agent: {},
  } as never)
  groupCall = vi.fn(async () => ({
    data: {
      uri: `at://${GROUP_DID}/org.hypercerts.funding.receipt/abc`,
      cid: "bafycid",
    },
  }))
  vi.mocked(createGroupClient).mockReturnValue({ call: groupCall } as never)
  vi.mocked(enforceWriteRateLimit).mockResolvedValue(null)
})

describe("group funding — rate limit", () => {
  it("asks the limiter about the acting operator, not the group", async () => {
    const res = await callRoute({ record: validRecord })
    expect(res.status).toBe(200)
    expect(enforceWriteRateLimit).toHaveBeenCalledWith(
      OPERATOR_DID,
      "org.hypercerts.funding.receipt",
      expect.any(Function),
    )
  })

  it("returns the limiter's 429 without writing", async () => {
    vi.mocked(enforceWriteRateLimit).mockResolvedValue(
      NextResponse.json(
        { error: "Too many writes — try again later.", resetAt: 1 },
        { status: 429, headers: { "Retry-After": "42" } },
      ),
    )
    const res = await callRoute({ record: validRecord })
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("42")
    expect(groupCall).not.toHaveBeenCalled()
  })

  it("does not consume quota when the body is rejected", async () => {
    const res = await callRoute({})
    expect(res.status).toBe(400)
    expect(enforceWriteRateLimit).not.toHaveBeenCalled()
  })
})
