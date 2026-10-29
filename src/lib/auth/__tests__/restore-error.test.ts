import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  TokenInvalidError,
  TokenRefreshError,
  TokenRevokedError,
} from "@atproto/oauth-client-node"

/**
 * Which `client.restore(did)` failures delete the app session (TECH-807).
 * Deleting on a transient failure signs the user out for nothing.
 */

const { sessionGet } = vi.hoisted(() => ({ sessionGet: vi.fn() }))
vi.mock("@/lib/auth/stores", () => ({
  getRedis: vi.fn(),
  RedisSessionStore: class {
    get = sessionGet
  },
}))

import { isSessionGone } from "../restore-error"
import { RequestLockTimeoutError } from "../request-lock"
import { ResponseTooLargeError } from "../response-limit"

const DID = "did:plc:alice"
const missing = () =>
  new TokenRefreshError(DID, "The session was deleted by another process")

beforeEach(() => {
  sessionGet.mockReset()
})

describe("isSessionGone", () => {
  it("keeps the session on a request-lock timeout", async () => {
    expect(await isSessionGone(new RequestLockTimeoutError("lock"), DID)).toBe(false)
  })

  it("keeps the session when a response hits the size cap, whatever the origin says", async () => {
    // The message names the origin; it must not pass for an auth failure.
    const err = new ResponseTooLargeError("https://expired-revoked.example/oauth/token", 1)
    expect(err.message).toMatch(/expired/)
    expect(await isSessionGone(err, DID)).toBe(false)
  })

  it("keeps the session when the auth server's metadata can't be fetched", async () => {
    const err = new Error("Failed to resolve OAuth server metadata for issuer: https://certified.one")
    expect(await isSessionGone(err, DID)).toBe(false)
  })

  it("keeps the session on an Upstash error", async () => {
    expect(await isSessionGone(new Error("UpstashError: ERR max requests limit exceeded"), DID)).toBe(false)
  })

  it("deletes on revoked, invalid or unrefreshable tokens", async () => {
    expect(await isSessionGone(new TokenRevokedError(DID), DID)).toBe(true)
    expect(await isSessionGone(new TokenInvalidError(DID), DID)).toBe(true)
    expect(await isSessionGone(new TokenRefreshError(DID, "The session was revoked"), DID)).toBe(true)
    expect(sessionGet).not.toHaveBeenCalled()
  })

  it("deletes on a 401 or 403 from upstream", async () => {
    expect(await isSessionGone(Object.assign(new Error("x"), { status: 401 }), DID)).toBe(true)
    expect(await isSessionGone(Object.assign(new Error("x"), { status: 403 }), DID)).toBe(true)
  })

  describe("'deleted by another process' (also what a failed store read looks like)", () => {
    it("deletes when the stored session is really absent", async () => {
      sessionGet.mockResolvedValue(undefined)
      expect(await isSessionGone(missing(), DID)).toBe(true)
      expect(sessionGet).toHaveBeenCalledWith(DID)
    })

    it("keeps the session when the store can't be read", async () => {
      sessionGet.mockRejectedValue(new Error("fetch failed"))
      expect(await isSessionGone(missing(), DID)).toBe(false)
    })

    it("keeps the session when it is in the store after all", async () => {
      sessionGet.mockResolvedValue({ tokenSet: { sub: DID } })
      expect(await isSessionGone(missing(), DID)).toBe(false)
    })
  })
})
