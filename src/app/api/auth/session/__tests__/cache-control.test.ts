import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the Cache-Control posture of the /api/auth/session GET handler
 * (judgment-010). This endpoint reports the current session DID; a stale
 * cached copy (in a CDN or the browser) can mislead the client about
 * whether it is signed in. Each of the three response shapes must carry
 * `Cache-Control: private, no-store`:
 *   1. { did: null }            — no session
 *   2. { did }                  — restored OK
 *   3. { did, transient: true } — restore failed transiently
 *
 * The route imports server-only deps (OAuth client, session) at module
 * load, so we mock those. getSessionDid drives shape (1) vs (2)/(3); the
 * stubbed OAuth client's restore() decides between (2) and (3).
 */

const getSessionDid = vi.fn()
const deleteSession = vi.fn()
const restore = vi.fn()

vi.mock("@/lib/auth/oauth-client", () => ({
  getOAuthClient: vi.fn(async () => ({ restore })),
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid,
  deleteSession,
}))
vi.mock("@/lib/utils/log-safe", () => ({ logSafe: vi.fn() }))

const DID = "did:plc:sessionuser0000000000000000"

beforeEach(() => {
  getSessionDid.mockReset()
  deleteSession.mockReset()
  restore.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("/api/auth/session — Cache-Control: private, no-store", () => {
  it("sets it on the { did: null } (no session) response", async () => {
    getSessionDid.mockResolvedValue(null)
    const { GET } = await import("../route")

    const res = await GET()

    expect(await res.json()).toEqual({ did: null })
    expect(res.headers.get("cache-control")).toBe("private, no-store")
  })

  it("sets it on the { did } (restore OK) response", async () => {
    getSessionDid.mockResolvedValue(DID)
    restore.mockResolvedValue(undefined)
    const { GET } = await import("../route")

    const res = await GET()

    expect(await res.json()).toEqual({ did: DID })
    expect(res.headers.get("cache-control")).toBe("private, no-store")
  })

  it("sets it on the { did, transient: true } (transient failure) response", async () => {
    getSessionDid.mockResolvedValue(DID)
    // A network/timeout-style error (no auth-failure signal) → transient.
    restore.mockRejectedValue(new Error("network timeout"))
    const { GET } = await import("../route")

    const res = await GET()

    expect(await res.json()).toEqual({ did: DID, transient: true })
    expect(deleteSession).not.toHaveBeenCalled()
    expect(res.headers.get("cache-control")).toBe("private, no-store")
  })
})
