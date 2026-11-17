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
  loadResolvedProfileOutcome,
  parseRetryAfter,
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

  it("sends up to three chunks of one flush at a time", async () => {
    const pending: ((r: Response) => void)[] = []
    authFetch.mockImplementation(
      () => new Promise<Response>((resolve) => pending.push(resolve)),
    )
    const ids = Array.from(
      { length: 200 },
      (_, i) => `did:plc:${i.toString().padStart(24, "0")}`,
    )
    const ps = ids.map((id) => loadResolvedProfile(id))
    await vi.advanceTimersByTimeAsync(20)

    // Four chunks of 50: three in flight, the fourth waits for a slot.
    expect(authFetch).toHaveBeenCalledTimes(3)
    pending[0](jsonResponse({ results: {} }))
    await vi.advanceTimersByTimeAsync(0)
    expect(authFetch).toHaveBeenCalledTimes(4)

    for (const resolve of pending.slice(1)) resolve(jsonResponse({ results: {} }))
    await Promise.all(ps)
  })

  it("does not send queued chunks into a 429 cooldown", async () => {
    authFetch.mockResolvedValueOnce(jsonResponse({ error: "x" }, 429))
    authFetch.mockResolvedValue(jsonResponse({ results: {} }))
    const ids = Array.from(
      { length: 200 },
      (_, i) => `did:plc:${i.toString().padStart(24, "0")}`,
    )
    const ps = ids.map((id) => loadResolvedProfile(id))
    await vi.advanceTimersByTimeAsync(20)
    const results = await Promise.all(ps)

    // The fourth chunk degraded to null instead of being sent.
    expect(authFetch).toHaveBeenCalledTimes(3)
    expect(results.slice(150).every((r) => r === null)).toBe(true)
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

  it("tells a failed lookup from an identity that doesn't resolve", async () => {
    authFetch.mockResolvedValueOnce(
      jsonResponse({
        results: {
          "did:plc:a": { did: "did:plc:a", handle: "a.test" },
          "did:plc:b": null,
        },
      }),
    )
    const a = loadResolvedProfileOutcome("did:plc:a")
    const b = loadResolvedProfileOutcome("did:plc:b")
    await vi.advanceTimersByTimeAsync(20)
    expect(await a).toMatchObject({ status: "ok", profile: { handle: "a.test" } })
    expect(await b).toEqual({ status: "missing" })

    authFetch.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
    const c = loadResolvedProfileOutcome("did:plc:c")
    await vi.advanceTimersByTimeAsync(20)
    expect(await c).toEqual({ status: "failed", retryAfterMs: null })

    authFetch.mockRejectedValueOnce(new TypeError("network"))
    const d = loadResolvedProfileOutcome("did:plc:d")
    await vi.advanceTimersByTimeAsync(20)
    expect(await d).toEqual({ status: "failed", retryAfterMs: null })
  })

  it("shares one lookup between the profile and the outcome APIs", async () => {
    authFetch.mockResolvedValue(
      jsonResponse({ results: { "did:plc:a": { did: "did:plc:a", handle: "a.test" } } }),
    )
    const profile = loadResolvedProfile("did:plc:a")
    const outcome = loadResolvedProfileOutcome("did:plc:a")
    await vi.advanceTimersByTimeAsync(20)
    expect(await profile).toMatchObject({ handle: "a.test" })
    expect((await outcome).status).toBe("ok")
    expect(authFetch).toHaveBeenCalledTimes(1)
  })

  it("honours a 429's Retry-After: on the outcome, and as the cooldown", async () => {
    authFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "12" },
      }),
    )
    const first = loadResolvedProfileOutcome("did:plc:a")
    await vi.advanceTimersByTimeAsync(20)
    expect(await first).toEqual({ status: "failed", retryAfterMs: 12_000 })

    // A fresh identity waits out the 12s, not just the 5s default.
    authFetch.mockResolvedValue(
      jsonResponse({ results: { "did:plc:b": { did: "did:plc:b", handle: "b.test" } } }),
    )
    const second = loadResolvedProfileOutcome("did:plc:b")
    await vi.advanceTimersByTimeAsync(6_000)
    expect(authFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6_500)
    expect((await second).status).toBe("ok")
    expect(authFetch).toHaveBeenCalledTimes(2)
  })

  it("replaces a cached failure only when asked to retry", async () => {
    authFetch.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
    const first = loadResolvedProfileOutcome("did:plc:a")
    await vi.advanceTimersByTimeAsync(20)
    expect((await first).status).toBe("failed")

    // Without `retry` the failure is reused (no new request).
    const reused = loadResolvedProfileOutcome("did:plc:a")
    expect(reused).toBe(first)
    await vi.advanceTimersByTimeAsync(20)
    expect(authFetch).toHaveBeenCalledTimes(1)

    // With it, a fresh lookup goes out.
    authFetch.mockResolvedValue(
      jsonResponse({ results: { "did:plc:a": { did: "did:plc:a", handle: "a.test" } } }),
    )
    const retried = loadResolvedProfileOutcome("did:plc:a", { retry: true })
    await vi.advanceTimersByTimeAsync(20)
    expect((await retried).status).toBe("ok")
    expect(authFetch).toHaveBeenCalledTimes(2)

    // A success isn't replaced by a retry.
    const again = loadResolvedProfileOutcome("did:plc:a", { retry: true })
    expect(again).toBe(retried)
  })

  it("doesn't replace an identity that doesn't resolve on retry", async () => {
    authFetch.mockResolvedValueOnce(jsonResponse({ results: { "did:plc:a": null } }))
    const first = loadResolvedProfileOutcome("did:plc:a")
    await vi.advanceTimersByTimeAsync(20)
    expect(await first).toEqual({ status: "missing" })
    expect(loadResolvedProfileOutcome("did:plc:a", { retry: true })).toBe(first)
  })
})

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates, capped at a minute", () => {
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter("soon")).toBeNull()
    expect(parseRetryAfter("3")).toBe(3_000)
    expect(parseRetryAfter("0")).toBe(0)
    expect(parseRetryAfter("3600")).toBe(60_000)
    const inTenSeconds = new Date(Date.now() + 10_000).toUTCString()
    const ms = parseRetryAfter(inTenSeconds)!
    expect(ms).toBeGreaterThan(8_000)
    expect(ms).toBeLessThanOrEqual(10_000)
  })
})
