import { describe, it, expect, vi, beforeEach } from "vitest"
import { TokenRefreshError } from "@atproto/oauth-client-node"

/**
 * TECH-807 follow-up: getAuthenticatedAgent backs every group route. On
 * 2026-10-29 a one-off "Failed to resolve OAuth server metadata" from
 * certified.one went through it on /api/groups/memberships, which deleted the
 * session and answered 401, and the browser signed the user out. A transient
 * failure must keep the session and surface as a 503.
 */

const { getSessionDid, deleteSession, restore } = vi.hoisted(() => ({
  getSessionDid: vi.fn(),
  deleteSession: vi.fn(),
  restore: vi.fn(),
}))

vi.mock("@/lib/auth/session", () => ({ getSessionDid, deleteSession }))
vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient: async () => ({ restore }) }))
vi.mock("@/lib/auth/stores", () => ({ getRedis: vi.fn(), RedisSessionStore: class {} }))
vi.mock("@atproto/api", () => ({ Agent: class {} }))

import { getAuthenticatedAgent } from "../proxy-agent"
import { SessionUnavailableError } from "@/lib/auth/restore-error"
import { GET as membershipsGET } from "@/app/api/groups/memberships/route"

const DID = "did:plc:alice"
const METADATA_ERROR = new Error("Failed to resolve OAuth server metadata for issuer: https://certified.one")

beforeEach(() => {
  getSessionDid.mockReset().mockResolvedValue(DID)
  deleteSession.mockReset()
  restore.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("getAuthenticatedAgent", () => {
  it("keeps the session and throws a 503 error on a transient restore failure", async () => {
    restore.mockRejectedValue(METADATA_ERROR)

    const err = await getAuthenticatedAgent().catch((e: unknown) => e)

    expect(err).toBeInstanceOf(SessionUnavailableError)
    expect((err as SessionUnavailableError).status).toBe(503)
    expect(deleteSession).not.toHaveBeenCalled()
  })

  it("deletes the session and returns null when it was revoked", async () => {
    restore.mockRejectedValue(new TokenRefreshError(DID, "The session was revoked"))

    expect(await getAuthenticatedAgent()).toBeNull()
    expect(deleteSession).toHaveBeenCalledTimes(1)
  })
})

describe("GET /api/groups/memberships (the route that signed a user out)", () => {
  it("answers 503, not 401, on a transient restore failure", async () => {
    restore.mockRejectedValue(METADATA_ERROR)

    const res = await membershipsGET({ nextUrl: new URL("https://app.example/api/groups/memberships") } as never)

    expect(res.status).toBe(503)
    expect(deleteSession).not.toHaveBeenCalled()
  })
})
