import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

/**
 * Tests for the group endorse route's badge-ref validation and
 * rate-limit parity.
 *
 * The `badge` strongRef is client-supplied and was previously only
 * shape-checked (`{ uri, cid }`), so a caller could make a group award
 * cite a record on any repo, in any collection. An award on the group's
 * repo must reference a badge DEFINITION on that same repo.
 *
 * Rate limiting: the personal path limits `badge.award` creates in the
 * xrpc proxy, which this BFF route bypasses entirely — group-issued
 * endorsements were unlimited. The limiter itself lives in
 * `enforceWriteRateLimit`; its fail-open and 429-shaping behaviour is
 * covered in `src/lib/auth/__tests__/rate-limit.test.ts`. What matters
 * here is that the route asks it about the right DID and honours what it
 * returns. The route-to-registry coupling is pinned separately by
 * `src/app/api/groups/__tests__/write-rate-limit-contract.test.ts`.
 *
 * The route pulls in server-only deps at import time, so those are
 * mocked and the POST handler is driven down to the group-service call.
 */

vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceWriteRateLimit: vi.fn(async () => null),
}))
vi.mock("@/lib/groups/proxy-agent", () => ({
  getAuthenticatedAgent: vi.fn(),
  createGroupClient: vi.fn(),
}))

import { POST } from "../route"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { enforceWriteRateLimit } from "@/lib/auth/rate-limit"

const GROUP_DID = "did:plc:groupaaaaaaaaaaaaaaaaaaa"
const OPERATOR_DID = "did:plc:operatoraaaaaaaaaaaaaaaa"
const SUBJECT_DID = "did:plc:subjectaaaaaaaaaaaaaaaaa"
const DEF_COLLECTION = "app.certified.badge.definition"

const validBadge = {
  uri: `at://${GROUP_DID}/${DEF_COLLECTION}/self`,
  cid: "bafyreiabc",
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://example.test/api/groups/x/endorse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function callRoute(body: Record<string, unknown>) {
  return POST(makeRequest(body) as never, {
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
    data: { uri: `at://${GROUP_DID}/app.certified.badge.award/abc`, cid: "bafycid" },
  }))
  vi.mocked(createGroupClient).mockReturnValue({ call: groupCall } as never)
  vi.mocked(enforceWriteRateLimit).mockResolvedValue(null)
})

describe("group endorse — badge ref validation", () => {
  it("accepts a definition ref on the group's own repo", async () => {
    const res = await callRoute({ subject: SUBJECT_DID, badge: validBadge })
    expect(res.status).toBe(200)
    expect(groupCall).toHaveBeenCalledOnce()
  })

  it("rejects a badge ref living on a foreign repo", async () => {
    const res = await callRoute({
      subject: SUBJECT_DID,
      badge: {
        uri: `at://did:plc:foreignaaaaaaaaaaaaaaaaa/${DEF_COLLECTION}/self`,
        cid: "bafyreiabc",
      },
    })
    expect(res.status).toBe(400)
    expect(groupCall).not.toHaveBeenCalled()
  })

  it("rejects a badge ref pointing at a non-definition collection", async () => {
    const res = await callRoute({
      subject: SUBJECT_DID,
      badge: {
        uri: `at://${GROUP_DID}/app.certified.badge.award/self`,
        cid: "bafyreiabc",
      },
    })
    expect(res.status).toBe(400)
    expect(groupCall).not.toHaveBeenCalled()
  })

  it("rejects a malformed at:// uri", async () => {
    const res = await callRoute({
      subject: SUBJECT_DID,
      badge: { uri: "https://example.test/not-an-at-uri", cid: "bafyreiabc" },
    })
    expect(res.status).toBe(400)
    expect(groupCall).not.toHaveBeenCalled()
  })

  it("still rejects a missing badge ref", async () => {
    const res = await callRoute({ subject: SUBJECT_DID })
    expect(res.status).toBe(400)
    expect(groupCall).not.toHaveBeenCalled()
  })
})

describe("group endorse — rate limit parity", () => {
  it("asks the limiter about the acting operator, not the group", () => {
    return callRoute({ subject: SUBJECT_DID, badge: validBadge }).then(() => {
      expect(enforceWriteRateLimit).toHaveBeenCalledWith(
        OPERATOR_DID,
        "app.certified.badge.award",
        expect.any(Function),
      )
    })
  })

  it("returns the limiter's 429 without writing", async () => {
    const resetAt = Date.now() + 30_000
    vi.mocked(enforceWriteRateLimit).mockResolvedValue(
      NextResponse.json(
        { error: "Too many writes — try again later.", resetAt },
        { status: 429, headers: { "Retry-After": "30" } },
      ),
    )
    const res = await callRoute({ subject: SUBJECT_DID, badge: validBadge })
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("30")
    expect(groupCall).not.toHaveBeenCalled()
  })

  it("does not consume quota when the badge ref is rejected", async () => {
    // Validation runs first, so a malformed request can't be used to burn
    // an operator's budget.
    const res = await callRoute({
      subject: SUBJECT_DID,
      badge: { uri: "https://example.test/nope", cid: "bafyreiabc" },
    })
    expect(res.status).toBe(400)
    expect(enforceWriteRateLimit).not.toHaveBeenCalled()
  })
})
