import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Anti-privilege-escalation for the group members route
 * (`POST` /api/groups/[groupDid]/members).
 *
 * A member can be ADDED only with an *assignable* role. `owner` is deliberately
 * NOT assignable (constants.ts: ORG_ASSIGNABLE_ROLES = ORG_ROLES minus owner),
 * so ownership can never be conferred on the add path — only via the
 * owner-gated role.set path. The invariant asserted here: POSTing
 * `role: "owner"` (or any non-assignable value) is rejected with 400 and the
 * upstream `member.add` mutation is NEVER invoked, so no request to make
 * someone an owner can leave the BFF.
 *
 * `isValidDid` and `isAssignableRole` are the real guards under test — only the
 * auth / CSRF / proxy seams are mocked.
 */

vi.mock("@/lib/groups/proxy-agent", () => ({
  getAuthenticatedAgent: vi.fn(),
  callGroupServiceJson: vi.fn(),
}))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))

import {
  getAuthenticatedAgent,
  callGroupServiceJson,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"

const GROUP_DID = "did:plc:abcdefghijklmnopqrstuvwx"
const MEMBER_DID = "did:plc:bcdefghijklmnopqrstuvwxy"

function makeRequest(body?: unknown): Request {
  return new Request(`https://example.test/api/groups/${GROUP_DID}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://example.test",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

function makeContext(groupDid = GROUP_DID) {
  return { params: Promise.resolve({ groupDid }) }
}

async function post(body?: unknown, groupDid = GROUP_DID): Promise<Response> {
  const { POST } = await import("../route")
  return POST(
    makeRequest(body) as unknown as Parameters<typeof POST>[0],
    makeContext(groupDid) as unknown as Parameters<typeof POST>[1],
  )
}

beforeEach(() => {
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  vi.mocked(getAuthenticatedAgent)
    .mockReset()
    .mockResolvedValue({ agent: {} as never, did: "did:plc:alice" })
  vi.mocked(callGroupServiceJson).mockReset().mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /members — cannot add a member as owner", () => {
  it("rejects role:'owner' with 400 and never calls member.add", async () => {
    const res = await post({ memberDid: MEMBER_DID, role: "owner" })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: "role must be 'member' or 'admin'",
    })
    expect(callGroupServiceJson).not.toHaveBeenCalled()
  })

  it("rejects any other non-assignable role with 400 and never calls member.add", async () => {
    for (const role of ["superadmin", "OWNER", "root"]) {
      vi.mocked(callGroupServiceJson).mockClear()
      const res = await post({ memberDid: MEMBER_DID, role })
      expect(res.status).toBe(400)
      expect(callGroupServiceJson).not.toHaveBeenCalled()
    }
  })

  it("forwards member.add with the caller-supplied role verbatim for an assignable role", async () => {
    const res = await post({ memberDid: MEMBER_DID, role: "admin" })
    expect(res.status).toBe(200)
    expect(callGroupServiceJson).toHaveBeenCalledWith(
      expect.anything(),
      "app.certified.group.member.add",
      { body: { repo: GROUP_DID, memberDid: MEMBER_DID, role: "admin" } },
    )
  })

  it("defaults to role:'member' when no role is supplied", async () => {
    const res = await post({ memberDid: MEMBER_DID })
    expect(res.status).toBe(200)
    expect(callGroupServiceJson).toHaveBeenCalledWith(
      expect.anything(),
      "app.certified.group.member.add",
      { body: { repo: GROUP_DID, memberDid: MEMBER_DID, role: "member" } },
    )
  })
})

describe("POST /members — gate", () => {
  it("returns the CSRF response before any upstream call", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const res = await post({ memberDid: MEMBER_DID, role: "member" })
    expect(res.status).toBe(403)
    expect(callGroupServiceJson).not.toHaveBeenCalled()
  })

  it("401s when not authenticated", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValueOnce(null)
    const res = await post({ memberDid: MEMBER_DID, role: "member" })
    expect(res.status).toBe(401)
    expect(callGroupServiceJson).not.toHaveBeenCalled()
  })

  it("400s on an invalid group DID", async () => {
    const res = await post({ memberDid: MEMBER_DID, role: "member" }, "nope")
    expect(res.status).toBe(400)
    expect(callGroupServiceJson).not.toHaveBeenCalled()
  })

  it("400s when memberDid is missing or malformed", async () => {
    const missing = await post({ role: "member" })
    expect(missing.status).toBe(400)
    const bad = await post({ memberDid: "not-a-did", role: "member" })
    expect(bad.status).toBe(400)
    expect(callGroupServiceJson).not.toHaveBeenCalled()
  })
})
