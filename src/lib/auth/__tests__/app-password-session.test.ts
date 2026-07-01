import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Unit tests for the elevated password-session helper (issue #223).
 *
 * Mocks the PDS-resolution + Redis seams and `fetch` so we exercise the
 * `createSession` → store, the three unlock outcomes, lock teardown, and the
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
  resolvePdsUrl: vi.fn(async () => "https://pds.example"),
}))

import {
  establish,
  getElevated,
  end,
  callPds,
} from "@/lib/auth/app-password-session"
import { resolvePdsUrl } from "@/lib/atproto/did"

const DID = "did:plc:alice"
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
  vi.mocked(resolvePdsUrl).mockResolvedValue("https://pds.example")
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("establish", () => {
  it("stores the session and returns ok on a successful createSession", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        did: DID,
        accessJwt: "access-jwt",
        refreshJwt: "refresh-jwt",
        handle: "alice.example",
      }),
    )

    const result = await establish(DID, "hunter2")
    expect(result).toEqual({ status: "ok" })

    // createSession called against the resolved PDS with the DID as identifier.
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("https://pds.example/xrpc/com.atproto.server.createSession")
    const sent = JSON.parse((init as RequestInit).body as string)
    expect(sent.identifier).toBe(DID)
    expect(sent.password).toBe("hunter2")
    expect(sent.authFactorToken).toBeUndefined()

    // Stored under the DID-keyed elevated key, with a TTL, and only the
    // tokens + pdsUrl (no handle / email).
    expect(mockRedis.set).toHaveBeenCalledTimes(1)
    const [key, value, opts] = mockRedis.set.mock.calls[0]
    expect(key).toBe(`apppw:elev:${DID}`)
    expect(opts).toEqual({ ex: 600 })
    expect(JSON.parse(value as string)).toEqual({
      accessJwt: "access-jwt",
      refreshJwt: "refresh-jwt",
      pdsUrl: "https://pds.example",
    })
  })

  it("forwards authFactorToken when provided", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ did: DID, accessJwt: "a", refreshJwt: "r" }),
    )
    await establish(DID, "hunter2", "123456")
    const sent = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    )
    expect(sent.authFactorToken).toBe("123456")
  })

  it("maps AuthFactorTokenRequired to twoFactorRequired (and does NOT store)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "AuthFactorTokenRequired" }, 401),
    )
    const result = await establish(DID, "hunter2")
    expect(result).toEqual({ status: "twoFactorRequired" })
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("maps a wrong-password 401 to invalid", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "AuthenticationRequired" }, 401),
    )
    const result = await establish(DID, "wrong")
    expect(result).toEqual({ status: "invalid" })
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("maps a wrong/expired 2FA code (InvalidToken, 400) to invalidCode", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "InvalidToken" }, 400))
    const result = await establish(DID, "hunter2", "000000")
    expect(result).toEqual({ status: "invalidCode" })
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("maps ExpiredToken (400) to invalidCode", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "ExpiredToken" }, 400))
    expect(await establish(DID, "hunter2", "000000")).toEqual({
      status: "invalidCode",
    })
  })

  it("throws 502 and does NOT store when a 200 response omits the access token", async () => {
    // Defence-in-depth guard: never persist a partial/full-privilege session.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ did: DID, refreshJwt: "r" }), // accessJwt missing
    )
    await expect(establish(DID, "hunter2")).rejects.toMatchObject({
      status: 502,
    })
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("throws (not invalid) when the created session is for a different DID", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ did: "did:plc:someone-else", accessJwt: "a", refreshJwt: "r" }),
    )
    await expect(establish(DID, "hunter2")).rejects.toThrow()
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it("throws with the upstream status on a 5xx", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "InternalError" }, 500))
    await expect(establish(DID, "hunter2")).rejects.toMatchObject({
      status: 500,
    })
  })

  it("throws when the PDS can't be resolved", async () => {
    vi.mocked(resolvePdsUrl).mockResolvedValueOnce(null)
    await expect(establish(DID, "hunter2")).rejects.toMatchObject({
      status: 502,
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("getElevated", () => {
  it("parses a stored JSON string", async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        accessJwt: "a",
        refreshJwt: "r",
        pdsUrl: "https://pds.example",
      }),
    )
    const session = await getElevated(DID)
    expect(session).toEqual({
      accessJwt: "a",
      refreshJwt: "r",
      pdsUrl: "https://pds.example",
    })
  })

  it("accepts an already-parsed object (Upstash auto-deserialize)", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "a",
      refreshJwt: "r",
      pdsUrl: "https://pds.example",
    })
    expect(await getElevated(DID)).toMatchObject({ accessJwt: "a" })
  })

  it("returns null when nothing is stored", async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    expect(await getElevated(DID)).toBeNull()
  })

  it("returns null on a malformed stored value", async () => {
    mockRedis.get.mockResolvedValueOnce("not json")
    expect(await getElevated(DID)).toBeNull()
  })
})

describe("end", () => {
  it("calls deleteSession with the refresh token, then dels the key", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "a",
      refreshJwt: "refresh-jwt",
      pdsUrl: "https://pds.example",
    })
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200))

    await end(DID)

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("https://pds.example/xrpc/com.atproto.server.deleteSession")
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer refresh-jwt",
    })
    expect(mockRedis.del).toHaveBeenCalledWith(`apppw:elev:${DID}`)
  })

  it("still dels the key when deleteSession throws", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "a",
      refreshJwt: "r",
      pdsUrl: "https://pds.example",
    })
    mockFetch.mockRejectedValueOnce(new Error("network"))
    await end(DID)
    expect(mockRedis.del).toHaveBeenCalledWith(`apppw:elev:${DID}`)
  })

  it("dels the key even when there is no stored session", async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    await end(DID)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockRedis.del).toHaveBeenCalledWith(`apppw:elev:${DID}`)
  })
})

describe("callPds", () => {
  it("returns locked when there is no session", async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    const result = await callPds(DID, "com.atproto.server.listAppPasswords")
    expect(result).toEqual({ kind: "locked" })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("attaches the Bearer access token and returns the response on success", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "access-jwt",
      refreshJwt: "r",
      pdsUrl: "https://pds.example",
    })
    mockFetch.mockResolvedValueOnce(jsonResponse({ passwords: [] }))

    const result = await callPds(DID, "com.atproto.server.listAppPasswords")
    expect(result.kind).toBe("ok")
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(
      "https://pds.example/xrpc/com.atproto.server.listAppPasswords",
    )
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer access-jwt",
    })
  })

  it("clears the dead session and returns locked on a 401 from the PDS", async () => {
    // First get: callPds's own load. Second get: end()'s load.
    mockRedis.get.mockResolvedValue({
      accessJwt: "access-jwt",
      refreshJwt: "r",
      pdsUrl: "https://pds.example",
    })
    // op call → 401; then end() → deleteSession ok.
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: "ExpiredToken" }, 401))
      .mockResolvedValueOnce(jsonResponse({}, 200))

    const result = await callPds(DID, "com.atproto.server.createAppPassword", {
      method: "POST",
      body: { name: "x" },
    })
    expect(result).toEqual({ kind: "locked" })
    expect(mockRedis.del).toHaveBeenCalledWith(`apppw:elev:${DID}`)
  })

  it("sends a JSON body with Content-Type for write ops", async () => {
    mockRedis.get.mockResolvedValueOnce({
      accessJwt: "a",
      refreshJwt: "r",
      pdsUrl: "https://pds.example",
    })
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: "x", password: "p" }))
    await callPds(DID, "com.atproto.server.createAppPassword", {
      method: "POST",
      body: { name: "x" },
    })
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" })
    expect(JSON.parse(init.body as string)).toEqual({ name: "x" })
  })
})
