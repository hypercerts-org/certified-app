import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Unit tests for the elevated GROUP-account session helper.
 *
 * An owner/admin unlocks the GROUP account with the group's password to act AS
 * the group. Mirrors `app-password-session.test.ts`, but the session is for the
 * GROUP account (identifier = groupDid) and is keyed by BOTH the caller and the
 * group, so one owner's unlock is never reachable by another caller.
 *
 * Mocks the PDS-resolution + Redis seams and `fetch` so we exercise the
 * `createSession` → store, the unlock outcomes (including the safety check that
 * the created session must be for the target group), lock teardown, and the
 * locked-on-401 behaviour of `callPds` without touching a real PDS or Redis.
 */

const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}

vi.mock("@/lib/auth/stores", () => ({
  getRedis: () => mockRedis,
}))

vi.mock("@/lib/atproto/did", () => ({
  resolvePdsUrl: vi.fn(async () => "https://group-pds.example"),
}))

import {
  establish,
  getElevated,
  end,
  callPds,
} from "@/lib/auth/group-account-session"
import { resolvePdsUrl } from "@/lib/atproto/did"

const CALLER = "did:plc:owner"
const GROUP = "did:plc:group"
const ELEV_KEY = `groupacct:elev:${CALLER}:${GROUP}`

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
  mockRedis.set.mockReset()
  mockRedis.get.mockReset()
  mockRedis.del.mockReset()
  vi.mocked(resolvePdsUrl).mockResolvedValue("https://group-pds.example")
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("establish", () => {
  it("stores the session under the caller+group key and returns ok on success", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        did: GROUP,
        accessJwt: "access-jwt",
        refreshJwt: "refresh-jwt",
        handle: "group.example",
        email: "group@example.com",
      }),
    )

    const result = await establish(CALLER, GROUP, "groupsecret")
    expect(result).toEqual({ status: "ok" })

    // createSession is run against the GROUP's resolved PDS, with the GROUP
    // DID as the identifier — never the caller's.
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(
      "https://group-pds.example/xrpc/com.atproto.server.createSession",
    )
    const sent = JSON.parse((init as RequestInit).body as string)
    expect(sent.identifier).toBe(GROUP)
    expect(sent.password).toBe("groupsecret")
    expect(sent.authFactorToken).toBeUndefined()

    // resolvePdsUrl is asked about the GROUP, not the caller.
    expect(resolvePdsUrl).toHaveBeenCalledWith(GROUP)

    // Stored under the caller+group-keyed elevated key, with a TTL, and only
    // the tokens + pdsUrl (no handle / email).
    expect(mockRedis.set).toHaveBeenCalledTimes(1)
    const [key, value, opts] = mockRedis.set.mock.calls[0]
    expect(key).toBe(ELEV_KEY)
    expect(opts).toEqual({ ex: 600 })
    expect(JSON.parse(value as string)).toEqual({
      accessJwt: "access-jwt",
      refreshJwt: "refresh-jwt",
      pdsUrl: "https://group-pds.example",
    })
    // The password / handle / email must never be persisted.
    expect(value as string).not.toContain("groupsecret")
    expect(value as string).not.toContain("group@example.com")
    expect(value as string).not.toContain("group.example")
  })

  it("forwards authFactorToken when provided and never leaks it", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ did: GROUP, accessJwt: "a", refreshJwt: "r" }),
    )
    await establish(CALLER, GROUP, "groupsecret", "123456")

    const sent = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    )
    expect(sent.authFactorToken).toBe("123456")

    // The 2FA token is sent to the PDS but never stored in Redis.
    const storedValue = mockRedis.set.mock.calls[0][1] as string
    expect(storedValue).not.toContain("123456")
    expect(storedValue).not.toContain("groupsecret")
  })

  it("maps AuthFactorTokenRequired to twoFactorRequired (and does NOT store)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "AuthFactorTokenRequired" }, 401),
    )
    const result = await establish(CALLER, GROUP, "groupsecret")
    expect(result).toEqual({ status: "twoFactorRequired" })
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("maps a wrong/expired 2FA code (InvalidToken, 400) to invalidCode", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "InvalidToken" }, 400))
    const result = await establish(CALLER, GROUP, "groupsecret", "000000")
    expect(result).toEqual({ status: "invalidCode" })
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("maps ExpiredToken (400) to invalidCode", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "ExpiredToken" }, 400))
    expect(await establish(CALLER, GROUP, "groupsecret", "000000")).toEqual({
      status: "invalidCode",
    })
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("maps a wrong-password 401 (AuthenticationRequired) to invalid", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "AuthenticationRequired" }, 401),
    )
    const result = await establish(CALLER, GROUP, "wrong")
    expect(result).toEqual({ status: "invalid" })
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("CRITICAL: refuses (throws) and does NOT store when createSession returns a different DID", async () => {
    // Safety check: the unlocked session must be for the TARGET group, never
    // some other account. A mismatched DID must reject so we can't act on /
    // rename the wrong account.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        did: "did:plc:some-other-group",
        accessJwt: "a",
        refreshJwt: "r",
      }),
    )
    await expect(establish(CALLER, GROUP, "groupsecret")).rejects.toMatchObject({
      status: 502,
    })
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("throws 502 and does NOT store when a 200 response omits the access token", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ did: GROUP, refreshJwt: "r" }), // accessJwt missing
    )
    await expect(establish(CALLER, GROUP, "groupsecret")).rejects.toMatchObject(
      { status: 502 },
    )
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("throws 502 and does NOT store when a 200 response omits the refresh token", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ did: GROUP, accessJwt: "a" }), // refreshJwt missing
    )
    await expect(establish(CALLER, GROUP, "groupsecret")).rejects.toMatchObject(
      { status: 502 },
    )
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("throws with the upstream status on a 5xx", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "InternalError" }, 500))
    await expect(establish(CALLER, GROUP, "groupsecret")).rejects.toMatchObject(
      { status: 500 },
    )
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("throws 502 when the group's PDS can't be resolved", async () => {
    vi.mocked(resolvePdsUrl).mockResolvedValueOnce(null)
    await expect(establish(CALLER, GROUP, "groupsecret")).rejects.toMatchObject(
      { status: 502 },
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("getElevated", () => {
  it("parses a stored JSON string", async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        accessJwt: "a",
        refreshJwt: "r",
        pdsUrl: "https://group-pds.example",
      }),
    )
    const session = await getElevated(CALLER, GROUP)
    expect(session).toEqual({
      accessJwt: "a",
      refreshJwt: "r",
      pdsUrl: "https://group-pds.example",
    })
    // Looked up under the caller+group composite key.
    expect(mockRedis.get).toHaveBeenCalledWith(ELEV_KEY)
  })

  it("accepts an already-parsed object (Upstash auto-deserialize)", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "a",
      refreshJwt: "r",
      pdsUrl: "https://group-pds.example",
    })
    expect(await getElevated(CALLER, GROUP)).toMatchObject({ accessJwt: "a" })
  })

  it("returns null when nothing is stored", async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    expect(await getElevated(CALLER, GROUP)).toBeNull()
  })

  it("returns null on a malformed stored value", async () => {
    mockRedis.get.mockResolvedValueOnce("not json")
    expect(await getElevated(CALLER, GROUP)).toBeNull()
  })

  it("returns null when the stored object is missing a required field", async () => {
    mockRedis.get.mockResolvedValueOnce({ accessJwt: "a", refreshJwt: "r" })
    expect(await getElevated(CALLER, GROUP)).toBeNull()
  })
})

describe("end", () => {
  it("calls deleteSession with the refresh token, then dels the caller+group key", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "a",
      refreshJwt: "refresh-jwt",
      pdsUrl: "https://group-pds.example",
    })
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200))

    await end(CALLER, GROUP)

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(
      "https://group-pds.example/xrpc/com.atproto.server.deleteSession",
    )
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer refresh-jwt",
    })
    expect(mockRedis.del).toHaveBeenCalledWith(ELEV_KEY)
  })

  it("still dels the key when deleteSession throws (best-effort)", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "a",
      refreshJwt: "r",
      pdsUrl: "https://group-pds.example",
    })
    mockFetch.mockRejectedValueOnce(new Error("network"))
    await end(CALLER, GROUP)
    expect(mockRedis.del).toHaveBeenCalledWith(ELEV_KEY)
  })

  it("dels the key even when there is no stored session", async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    await end(CALLER, GROUP)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockRedis.del).toHaveBeenCalledWith(ELEV_KEY)
  })
})

describe("callPds", () => {
  it("returns locked when there is no session", async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    const result = await callPds(CALLER, GROUP, "com.atproto.server.getSession")
    expect(result).toEqual({ kind: "locked" })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("attaches the Bearer access token, hits {pdsUrl}/xrpc/{nsid}, and returns the response on success", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "access-jwt",
      refreshJwt: "r",
      pdsUrl: "https://group-pds.example",
    })
    const okResponse = jsonResponse({ email: "group@example.com" })
    mockFetch.mockResolvedValueOnce(okResponse)

    const result = await callPds(CALLER, GROUP, "com.atproto.server.getSession")
    expect(result).toEqual({ kind: "ok", response: okResponse })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(
      "https://group-pds.example/xrpc/com.atproto.server.getSession",
    )
    expect((init as RequestInit).method).toBe("GET")
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer access-jwt",
    })
    // No body / Content-Type on a read.
    expect((init as RequestInit).body).toBeUndefined()
    expect((init as RequestInit).headers).not.toHaveProperty("Content-Type")
  })

  it("sends a JSON body with Content-Type for write ops", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "a",
      refreshJwt: "r",
      pdsUrl: "https://group-pds.example",
    })
    mockFetch.mockResolvedValueOnce(jsonResponse({}))
    await callPds(CALLER, GROUP, "com.atproto.server.updateEmail", {
      method: "POST",
      body: { email: "new@example.com" },
    })
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" })
    expect(JSON.parse(init.body as string)).toEqual({ email: "new@example.com" })
  })

  it("clears the dead session and returns locked on a 401 from the PDS", async () => {
    // First get: callPds's own load. Second get: end()'s load.
    mockRedis.get.mockResolvedValue({
      accessJwt: "access-jwt",
      refreshJwt: "r",
      pdsUrl: "https://group-pds.example",
    })
    // op call → 401; then end() → deleteSession ok.
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: "ExpiredToken" }, 401))
      .mockResolvedValueOnce(jsonResponse({}, 200))

    const result = await callPds(CALLER, GROUP, "com.atproto.server.updateEmail", {
      method: "POST",
      body: { email: "new@example.com" },
    })
    expect(result).toEqual({ kind: "locked" })
    expect(mockRedis.del).toHaveBeenCalledWith(ELEV_KEY)
  })
})
