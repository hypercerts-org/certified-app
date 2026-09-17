import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * BFF contract for the ownership-transfer route.
 *
 * What matters here is the targeting form CGS requires (#27): the `status`
 * QUERY carries `repo` on the querystring, while `propose` / `accept` /
 * `cancel` are JSON-body procedures that carry it in the body. Getting that
 * backwards is rejected upstream with `jwt audience does not match service
 * did`, which is a confusing failure to debug from the UI — so it's pinned.
 *
 * `isValidDid` is the real guard under test; only the auth / CSRF / rate-limit
 * / CGS seams are mocked.
 */

vi.mock("@/lib/groups/proxy-agent", () => ({
  getAuthenticatedAgent: vi.fn(),
  callGroupServiceJson: vi.fn(),
}))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  makeLimiter: () => ({}),
}))

import {
  getAuthenticatedAgent,
  callGroupServiceJson,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit } from "@/lib/auth/rate-limit"

const GROUP_DID = "did:plc:abcdefghijklmnopqrstuvwx"
const MEMBER_DID = "did:plc:bcdefghijklmnopqrstuvwxy"

function makeRequest(method: string, body?: unknown): Request {
  return new Request(
    `https://example.test/api/groups/${GROUP_DID}/ownership-transfer`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        origin: "https://example.test",
      },
      // A GET Request may not carry a body, so drop it there.
      ...(body !== undefined && method !== "GET"
        ? { body: JSON.stringify(body) }
        : {}),
    },
  )
}

function makeContext(groupDid = GROUP_DID) {
  return { params: Promise.resolve({ groupDid }) }
}

async function call(
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
  groupDid = GROUP_DID,
): Promise<Response> {
  const mod = await import("../route")
  const handler = mod[method]
  return handler(
    makeRequest(method, body) as unknown as Parameters<typeof handler>[0],
    makeContext(groupDid) as unknown as Parameters<typeof handler>[1],
  )
}

beforeEach(() => {
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(null)
  vi.mocked(getAuthenticatedAgent)
    .mockReset()
    .mockResolvedValue({ agent: {} as never, did: "did:plc:alice" })
  vi.mocked(callGroupServiceJson).mockReset().mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ownership-transfer — CGS targeting", () => {
  it("puts repo on the querystring for the status query", async () => {
    const res = await call("GET")
    expect(res.status).toBe(200)
    expect(callGroupServiceJson).toHaveBeenCalledWith(
      expect.anything(),
      "app.certified.group.ownershipTransfer.status",
      { query: { repo: GROUP_DID } },
    )
  })

  it("puts repo in the body for propose, with the proposed DID", async () => {
    const res = await call("POST", { newOwner: MEMBER_DID })
    expect(res.status).toBe(200)
    expect(callGroupServiceJson).toHaveBeenCalledWith(
      expect.anything(),
      "app.certified.group.ownershipTransfer.propose",
      { body: { repo: GROUP_DID, newOwner: MEMBER_DID } },
    )
  })

  it("puts repo in the body for accept, and names no member", async () => {
    // CGS derives the accepting member from the JWT — a client-supplied
    // identity here would be meaningless at best.
    const res = await call("PUT")
    expect(res.status).toBe(200)
    expect(callGroupServiceJson).toHaveBeenCalledWith(
      expect.anything(),
      "app.certified.group.ownershipTransfer.accept",
      { body: { repo: GROUP_DID } },
    )
  })

  it("puts repo in the body for cancel", async () => {
    const res = await call("DELETE")
    expect(res.status).toBe(200)
    expect(callGroupServiceJson).toHaveBeenCalledWith(
      expect.anything(),
      "app.certified.group.ownershipTransfer.cancel",
      { body: { repo: GROUP_DID } },
    )
  })
})

describe("ownership-transfer — validation", () => {
  it("rejects a missing or malformed newOwner before calling CGS", async () => {
    for (const newOwner of [undefined, "", "alice.test", "did:", 42]) {
      vi.mocked(callGroupServiceJson).mockClear()
      const res = await call("POST", { newOwner })
      expect(res.status).toBe(400)
      expect(callGroupServiceJson).not.toHaveBeenCalled()
    }
  })

  it("rejects an invalid group DID on every method", async () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
      vi.mocked(callGroupServiceJson).mockClear()
      const res = await call(method, { newOwner: MEMBER_DID }, "not-a-did")
      expect(res.status).toBe(400)
      expect(callGroupServiceJson).not.toHaveBeenCalled()
    }
  })
})

describe("ownership-transfer — gates", () => {
  it("returns the CSRF response before any upstream call on mutations", async () => {
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      vi.mocked(callGroupServiceJson).mockClear()
      vi.mocked(checkCsrf).mockReturnValueOnce(
        new Response(JSON.stringify({ error: "csrf" }), {
          status: 403,
        }) as never,
      )
      const res = await call(method, { newOwner: MEMBER_DID })
      expect(res.status).toBe(403)
      expect(callGroupServiceJson).not.toHaveBeenCalled()
    }
  })

  it("401s when not authenticated", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(null)
    const res = await call("GET")
    expect(res.status).toBe(401)
    expect(callGroupServiceJson).not.toHaveBeenCalled()
  })

  it("rate-limits propose before calling CGS", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "slow down" }), {
        status: 429,
      }) as never,
    )
    const res = await call("POST", { newOwner: MEMBER_DID })
    expect(res.status).toBe(429)
    expect(callGroupServiceJson).not.toHaveBeenCalled()
  })
})

describe("ownership-transfer — upstream errors", () => {
  it("forwards the atproto error code so the UI can tell cases apart", async () => {
    vi.mocked(callGroupServiceJson).mockRejectedValueOnce(
      Object.assign(new Error("Not a member"), {
        status: 400,
        error: "NotAMember",
      }),
    )
    const res = await call("POST", { newOwner: MEMBER_DID })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("NotAMember")
  })

  it("passes a non-party's NoPendingTransfer straight through", async () => {
    // A member who isn't a party gets the same 404 as when nothing is
    // pending. The BFF must not try to distinguish them — the service
    // makes the two indistinguishable on purpose.
    vi.mocked(callGroupServiceJson).mockRejectedValueOnce(
      Object.assign(new Error("No pending transfer"), {
        status: 404,
        error: "NoPendingTransfer",
      }),
    )
    const res = await call("PUT")
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe("NoPendingTransfer")
  })
})
