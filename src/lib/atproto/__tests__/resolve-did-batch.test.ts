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

  it("defers the next batch until the 429 cooldown lapses", async () => {
    authFetch.mockResolvedValueOnce(jsonResponse({ error: "x" }, 429))
    const first = loadResolvedProfile("did:plc:a")
    await vi.advanceTimersByTimeAsync(20)
    expect(await first).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)

    // A fresh identity queued during the cooldown must NOT be sent yet.
    authFetch.mockResolvedValue(
      jsonResponse({
        results: { "did:plc:b": { did: "did:plc:b", handle: "b.test" } },
      }),
    )
    const second = loadResolvedProfile("did:plc:b")
    await vi.advanceTimersByTimeAsync(1_000)
    expect(authFetch).toHaveBeenCalledTimes(1)

    // Once the 5s cooldown elapses it goes out.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await second).toMatchObject({ handle: "b.test" })
    expect(authFetch).toHaveBeenCalledTimes(2)
  })

  it("sends loads that arrive mid-flush in their own later batch", async () => {
    // Hold the first request open so a second load lands while flush #1
    // is in flight.
    let releaseFirst!: (r: Response) => void
    const firstResponse = new Promise<Response>((res) => {
      releaseFirst = res
    })
    authFetch.mockReturnValueOnce(firstResponse)

    const pA = loadResolvedProfile("did:plc:a")
    await vi.advanceTimersByTimeAsync(20)
    expect(authFetch).toHaveBeenCalledTimes(1)

    // Arrives while flush #1 awaits its response — must not be lost.
    const pB = loadResolvedProfile("did:plc:b")

    authFetch.mockResolvedValue(
      jsonResponse({
        results: { "did:plc:b": { did: "did:plc:b", handle: "b.test" } },
      }),
    )
    releaseFirst(
      jsonResponse({
        results: { "did:plc:a": { did: "did:plc:a", handle: "a.test" } },
      }),
    )
    expect(await pA).toMatchObject({ handle: "a.test" })

    await vi.advanceTimersByTimeAsync(20)
    expect(await pB).toMatchObject({ handle: "b.test" })
    expect(authFetch).toHaveBeenCalledTimes(2)
    // B went out on its own request, not bundled into A's.
    expect(bodyOf(1).identities).toEqual(["did:plc:b"])
  })

  it("resolves blank identities to null without a request", async () => {
    const p = loadResolvedProfile("   ")
    expect(await p).toBeNull()
    await vi.advanceTimersByTimeAsync(20)
    expect(authFetch).not.toHaveBeenCalled()
  })
})
