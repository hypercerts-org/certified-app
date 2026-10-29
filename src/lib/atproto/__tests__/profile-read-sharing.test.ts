import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * One profile view used to read the same profile record four times (navbar,
 * top bar, mobile sidebar, inline-edit base). Reads of a DID now share one
 * request and are reused briefly; writes and `fresh` reads bypass that.
 */

const { authFetch, writeToRepo } = vi.hoisted(() => ({ authFetch: vi.fn(), writeToRepo: vi.fn() }))
vi.mock("@/lib/auth/fetch", () => ({ authFetch }))
vi.mock("@/lib/atproto/repo-write", () => ({ writeToRepo }))

import { getProfile, getProfileWithCid, putProfile } from "../profile"

let n = 0
let did = ""
const record = (cid: string) =>
  Response.json({ value: { displayName: "Alice" }, cid })

beforeEach(() => {
  did = `did:plc:share${++n}`
  authFetch.mockReset().mockImplementation(async () => record("bafy1"))
  writeToRepo.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
})

describe("profile record reads", () => {
  it("concurrent reads of a DID share one request", async () => {
    const results = await Promise.all([
      getProfile(did),
      getProfileWithCid(did),
      getProfile(did),
      getProfileWithCid(did),
    ])
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(results[1]).toEqual({ value: { displayName: "Alice" }, cid: "bafy1" })
  })

  it("reuses a read for a few seconds, then reads again", async () => {
    vi.useFakeTimers()
    await getProfile(did)
    await vi.advanceTimersByTimeAsync(4_000)
    await getProfile(did)
    expect(authFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    await getProfile(did)
    expect(authFetch).toHaveBeenCalledTimes(2)
  })

  it("`fresh` reads go to the network", async () => {
    await getProfileWithCid(did)
    authFetch.mockImplementation(async () => record("bafy2"))
    expect((await getProfileWithCid(did, undefined, { fresh: true }))?.cid).toBe("bafy2")
    expect(authFetch).toHaveBeenCalledTimes(2)
  })

  it("a write drops the cached read, even when it fails", async () => {
    await getProfile(did)
    await putProfile(did, { displayName: "Alice B" })
    await getProfile(did)
    expect(authFetch).toHaveBeenCalledTimes(2)

    writeToRepo.mockRejectedValueOnce(new Error("InvalidSwap"))
    await expect(putProfile(did, { displayName: "Alice C" })).rejects.toThrow("InvalidSwap")
    await getProfile(did)
    expect(authFetch).toHaveBeenCalledTimes(3)
  })

  it("doesn't reuse a failed read", async () => {
    authFetch.mockImplementationOnce(async () => new Response("", { status: 500, statusText: "boom" }))
    await expect(getProfile(did)).rejects.toThrow("Failed to get profile")
    await getProfile(did)
    expect(authFetch).toHaveBeenCalledTimes(2)
  })

  it("an aborted caller stops waiting; the others still get the record", async () => {
    const controller = new AbortController()
    const aborted = getProfile(did, controller.signal)
    const other = getProfile(did)
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" })
    expect(await other).toEqual({ displayName: "Alice" })
    expect(authFetch).toHaveBeenCalledTimes(1)
  })
})
