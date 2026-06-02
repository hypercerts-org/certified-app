import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the client-side resolve-did coalescer. The point of this
 * module is to collapse one-request-per-row into one batched POST, and to
 * degrade gracefully (never throw, self-heal) on a 429 — the behaviours
 * that fix the explore/contributor 429s. We mock `authFetch` and drive the
 * batch window / TTLs with fake timers.
 */

const authFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
}))

import {
  loadResolvedProfile,
  __resetResolveDidBatchForTests,
} from "../resolve-did-batch"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function bodyOf(callIndex: number): { identities: string[] } {
  return JSON.parse(authFetch.mock.calls[callIndex][1].body)
}

beforeEach(() => {
  vi.useFakeTimers()
  authFetch.mockReset()
  __resetResolveDidBatchForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("resolve-did batch coalescer", () => {
  it("batches loads in the same window into one request", async () => {
    authFetch.mockResolvedValue(
      jsonResponse({
        results: {
          "did:plc:a": { did: "did:plc:a", handle: "a.test", displayName: "Alice" },
          "did:plc:b": { did: "did:plc:b", handle: "b.test" },
        },
      }),
    )

    const p1 = loadResolvedProfile("did:plc:a")
    const p2 = loadResolvedProfile("did:plc:b")
    await vi.advanceTimersByTimeAsync(20)
    const [a, b] = await Promise.all([p1, p2])

    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch.mock.calls[0][0]).toBe("/api/resolve-dids")
    expect(bodyOf(0).identities).toEqual(["did:plc:a", "did:plc:b"])
    expect(a?.displayName).toBe("Alice")
    expect(b?.handle).toBe("b.test")
  })

  it("dedupes identical identities to a single queue entry and promise", async () => {
    authFetch.mockResolvedValue(
      jsonResponse({
        results: { "did:plc:a": { did: "did:plc:a", handle: "a.test" } },
      }),
    )

    const p1 = loadResolvedProfile("did:plc:a")
    const p2 = loadResolvedProfile("did:plc:a")
    expect(p1).toBe(p2)

    await vi.advanceTimersByTimeAsync(20)
    await p1
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(bodyOf(0).identities).toEqual(["did:plc:a"])
  })

  it("degrades to null on a 429 instead of throwing", async () => {
    authFetch.mockResolvedValue(jsonResponse({ error: "rate limited" }, 429))
    const p = loadResolvedProfile("did:plc:a")
    await vi.advanceTimersByTimeAsync(20)
    await expect(p).resolves.toBeNull()
  })

  it("caches a negative result, then re-queries after the TTL", async () => {
    // First attempt is rate-limited.
    authFetch.mockResolvedValueOnce(jsonResponse({ error: "x" }, 429))
    const first = loadResolvedProfile("did:plc:a")
    await vi.advanceTimersByTimeAsync(20)
    expect(await first).toBeNull()

    // Within the TTL the negative entry is reused — no new request.
    authFetch.mockResolvedValue(
      jsonResponse({
        results: { "did:plc:a": { did: "did:plc:a", handle: "a.test" } },
      }),
    )
    const cached = loadResolvedProfile("did:plc:a")
    expect(await cached).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)

    // Past the negative TTL the entry is evicted and a fresh load resolves.
    await vi.advanceTimersByTimeAsync(31_000)
    const retry = loadResolvedProfile("did:plc:a")
    await vi.advanceTimersByTimeAsync(20)
    expect(await retry).toMatchObject({ handle: "a.test" })
    expect(authFetch).toHaveBeenCalledTimes(2)
  })

  it("chunks a set larger than the max batch into multiple requests", async () => {
    authFetch.mockResolvedValue(jsonResponse({ results: {} }))
    const ids = Array.from(
      { length: 60 },
      (_, i) => `did:plc:${i.toString().padStart(24, "0")}`,
    )
    const ps = ids.map((id) => loadResolvedProfile(id))
    await vi.advanceTimersByTimeAsync(20)
    await Promise.all(ps)

    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(bodyOf(0).identities).toHaveLength(50)
    expect(bodyOf(1).identities).toHaveLength(10)
  })

  it("resolves blank identities to null without a request", async () => {
    const p = loadResolvedProfile("   ")
    expect(await p).toBeNull()
    await vi.advanceTimersByTimeAsync(20)
    expect(authFetch).not.toHaveBeenCalled()
  })
})
