import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the sign-in profile seeding in the OAuth callback handler
 * (avatar-data-loss bug, item B1+C).
 *
 * Two guarantees under test:
 *
 *   B1 (INVARIANT): certified-app NEVER writes `app.bsky.actor.profile`.
 *       Sign-in only ever seeds `app.certified.actor.profile`.
 *
 *   C  (anti-clobber): the surviving app.certified seed only runs on a
 *       GENUINE record-not-found. On any other getRecord failure (5xx /
 *       network / timeout / rate-limit) we must NOT putRecord, because we
 *       can't prove the record is absent and seeding could clobber it.
 *       When the record already exists, we also must not putRecord.
 *
 * The route builds an Agent from the restored OAuth session at request
 * time, so we mock `@atproto/api`'s Agent to expose controllable
 * getRecord/putRecord mocks. Session, rate-limit, IP and log-safe are
 * mocked so the handler reaches the seeding path without real I/O.
 */

const getRecord = vi.fn()
const putRecord = vi.fn()
const restore = vi.fn()
const createSession = vi.fn()
const deleteSession = vi.fn()

vi.mock("@atproto/api", () => ({
  // The handler does `new Agent(oauthSession)` then calls
  // `agent.com.atproto.repo.getRecord / putRecord`. Use a `function`
  // implementation so `new Agent()` returns this object (an arrow fn as a
  // constructor returns a fresh instance, dropping our `com` stub).
  Agent: vi.fn().mockImplementation(function () {
    return { com: { atproto: { repo: { getRecord, putRecord } } } }
  }),
}))

vi.mock("@/lib/auth/oauth-client", () => ({
  getOAuthClient: vi.fn(async () => ({
    callback: vi.fn(async () => ({ session: { did: DID } })),
    restore,
  })),
}))

vi.mock("@/lib/auth/session", () => ({
  createSession,
  deleteSession,
}))

vi.mock("@/lib/utils/log-safe", () => ({ logSafe: vi.fn() }))

vi.mock("@/lib/auth/rate-limit", () => ({
  makeLimiter: vi.fn(() => ({})),
  // No rate denial — return null so the handler proceeds.
  enforceRateLimit: vi.fn(async () => null),
}))

vi.mock("@/lib/utils/ip", () => ({ clientIp: vi.fn(() => "127.0.0.1") }))

const DID = "did:plc:seeduser000000000000000000"

/** XRPCError-shaped genuine record-not-found: discriminator on `.error`. */
function recordNotFoundError(): Error & { error: string; status: number } {
  const e = new Error("Could not locate record") as Error & {
    error: string
    status: number
  }
  e.name = "XRPCError"
  e.error = "RecordNotFound"
  e.status = 400
  return e
}

/** A non-not-found upstream failure (5xx / network style). */
function upstreamError(): Error & { status: number } {
  const e = new Error("Internal Server Error") as Error & { status: number }
  e.status = 502
  return e
}

function makeRequest(): import("next/server").NextRequest {
  // The handler only reads `request.nextUrl.searchParams`; a minimal stub
  // is enough since getOAuthClient().callback is mocked.
  return {
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as import("next/server").NextRequest
}

beforeEach(() => {
  getRecord.mockReset()
  putRecord.mockReset()
  restore.mockReset()
  createSession.mockReset()
  deleteSession.mockReset()
  restore.mockResolvedValue({})
  createSession.mockResolvedValue(undefined)
  deleteSession.mockResolvedValue(undefined)
  putRecord.mockResolvedValue({ data: {} })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("auth callback — profile seeding (B1 invariant + C anti-clobber)", () => {
  it("(i) seeds app.certified on RecordNotFound, and NEVER writes app.bsky", async () => {
    getRecord.mockRejectedValue(recordNotFoundError())
    const { GET } = await import("../route")

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ did: DID })

    expect(putRecord).toHaveBeenCalledTimes(1)
    const input = putRecord.mock.calls[0][0]
    expect(input.collection).toBe("app.certified.actor.profile")
    // create-if-absent only (belt-and-suspenders).
    expect(input.swapRecord).toBeNull()

    // The invariant: app.bsky.actor.profile is never written.
    const wroteBsky = putRecord.mock.calls.some(
      (c) => c[0]?.collection === "app.bsky.actor.profile",
    )
    expect(wroteBsky).toBe(false)
  })

  it("(ii) does NOT putRecord when getRecord throws a 5xx/network error", async () => {
    getRecord.mockRejectedValue(upstreamError())
    const { GET } = await import("../route")

    const res = await GET(makeRequest())

    // Sign-in still succeeds (seeding is best-effort).
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ did: DID })
    expect(putRecord).not.toHaveBeenCalled()
  })

  it("(iii) does NOT putRecord when the record already exists", async () => {
    getRecord.mockResolvedValue({ data: { uri: "at://exists" } })
    const { GET } = await import("../route")

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ did: DID })
    expect(putRecord).not.toHaveBeenCalled()
  })
})
