import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the groups/register org-limit member-walk early-exit
 * (quality-056-authz-repo-4).
 *
 * The org-creation-limit check decides, per group, whether the caller's OWN
 * member entry was self-added (`m.did === ownerDid && m.addedBy === ownerDid`).
 * That is an existence test: once the matching entry is found on a page, the
 * answer for the group is settled and the remaining member pages carry no new
 * information. The pre-fix code paginated through EVERY member page of every
 * group regardless — an availability/perf smell against large groups.
 *
 * The fix is behavior-preserving: it stops paginating a group's member list
 * the moment the self-added entry is found. This test pins that early exit by
 * placing the owner's self-added entry on page 1 of a two-page member list and
 * asserting the second page is never fetched, while the limit decision is
 * unchanged.
 *
 * The route pulls in server-only deps (OAuth client, session, atproto Agent)
 * at import time, so we mock those and drive the POST handler through the
 * org-limit check via a mocked `createGroupAgent`.
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

import { getAuthenticatedAgent, createGroupAgent } from "@/lib/groups/proxy-agent"

const OWNER_DID = "did:plc:owner"

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://example.test/api/groups/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

/**
 * Global fetch returning a single group for the membership.list call and a
 * 200 success for the final register call.
 */
function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.includes("membership.list")) {
        return new Response(
          JSON.stringify({ groups: [{ groupDid: "did:plc:groupA" }] }),
          { status: 200 }
        )
      }
      if (url.includes("group.register")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("groups/register org-limit member-walk early exit (quality-056-authz-repo-4)", () => {
  it("stops paginating a group's member list once the self-added entry is found", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(makeAuth())
    installFetch()

    // member.list mock: page 1 contains the owner's self-added entry AND a
    // cursor pointing at a (nonexistent-in-spirit) page 2. The pre-fix walk
    // would follow the cursor and call again; the fixed walk must stop.
    const memberListCall = vi.fn(async (_lxm: string, params: { cursor?: string }) => {
      if (!params.cursor) {
        return {
          data: {
            members: [{ did: OWNER_DID, addedBy: OWNER_DID }],
            cursor: "page2",
          },
        }
      }
      return {
        data: {
          members: [{ did: "did:plc:other", addedBy: "did:plc:other" }],
          cursor: undefined,
        },
      }
    })
    vi.mocked(createGroupAgent).mockReturnValue({
      call: memberListCall,
    } as never)

    const { POST } = await import("../route")
    const res = await POST(
      makeRequest({ handle: "owner.test", ownerDid: OWNER_DID }) as never
    )

    // One self-created group < MAX_SELF_CREATED_ORGS (5), so registration
    // proceeds — the limit decision is unchanged by the early exit.
    expect(res.status).toBe(200)

    // Early exit: the matching entry was on page 1, so page 2 must never be
    // requested. Pre-fix code calls member.list twice (page 1 + page 2).
    expect(memberListCall).toHaveBeenCalledTimes(1)
  })
})
