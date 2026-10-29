import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * The OAuth client's distributed requestLock (TECH-807). A fake Redis keeps
 * the SET NX semantics and runs the release/renew scripts by what they say:
 * the owner check only applies when the script contains it, so a script that
 * drops it fails the takeover test. "Another instance" is simulated by
 * writing the lock key directly.
 */

const store = new Map<string, string>()
const ttls = new Map<string, number>()
const OWNER_CHECK = /redis\.call\("get", KEYS\[1\]\) == ARGV\[1\]/
const mockRedis = {
  set: vi.fn(async (key: string, value: string, opts: { nx?: boolean; px?: number }) => {
    if (opts?.nx && store.has(key)) return null
    store.set(key, value)
    return "OK"
  }),
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
    if (OWNER_CHECK.test(script) && store.get(keys[0]) !== args[0]) return 0
    if (script.includes('"del"')) return store.delete(keys[0]) ? 1 : 0
    if (script.includes('"pexpire"')) {
      ttls.set(keys[0], Number(args[1]))
      return 1
    }
    throw new Error("unexpected script")
  }),
}

vi.mock("@/lib/auth/stores", () => ({
  getRedis: () => mockRedis,
}))

const { logSafe } = vi.hoisted(() => ({ logSafe: vi.fn() }))
vi.mock("@/lib/utils/log-safe", () => ({ logSafe }))

import { redisRequestLock, RequestLockTimeoutError } from "../request-lock"

// A fresh name per test: requestLocalLock keeps a module-level queue, so a
// test that fails while holding the lock must not stall the next one.
let n = 0
let name = ""
let key = ""

beforeEach(() => {
  name = `@atproto-oauth-client-did:plc:alice-${++n}`
  key = `oauth:lock:${name}`
  store.clear()
  ttls.clear()
  mockRedis.set.mockClear()
  mockRedis.get.mockClear()
  mockRedis.eval.mockClear()
  logSafe.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

const tick = () => new Promise((r) => setTimeout(r, 0))
const renewCalls = () =>
  mockRedis.eval.mock.calls.filter(([script]) => script.includes('"pexpire"'))

describe("redisRequestLock", () => {
  it("holds the Redis key until an async fn settles, then releases it", async () => {
    let heldAfterAwait: string | undefined
    const result = await redisRequestLock(name, async () => {
      await tick()
      heldAfterAwait = store.get(key)
      return "done"
    })

    expect(result).toBe("done")
    expect(heldAfterAwait).toBeTruthy()
    expect(mockRedis.set).toHaveBeenCalledWith(key, heldAfterAwait, { nx: true, px: 15_000 })
    expect(store.has(key)).toBe(false)
  })

  it("uses a fresh owner token for every acquisition", async () => {
    await redisRequestLock(name, () => {})
    await redisRequestLock(name, () => {})
    const [first, second] = mockRedis.set.mock.calls.map((c) => c[1])
    expect(first).toBeTruthy()
    expect(first).not.toBe(second)
  })

  it("waits while another instance holds the lock", async () => {
    store.set(key, "other-instance")
    const fn = vi.fn(() => "ran")
    const pending = redisRequestLock(name, fn)

    await new Promise((r) => setTimeout(r, 200))
    expect(fn).not.toHaveBeenCalled()

    store.delete(key)
    await expect(pending).resolves.toBe("ran")
  })

  it("does not delete a lock another instance took over after a TTL lapse", async () => {
    await redisRequestLock(name, () => {
      store.set(key, "new-owner")
    })
    expect(store.get(key)).toBe("new-owner")
  })

  it("releases the lock when fn throws", async () => {
    await expect(
      redisRequestLock(name, () => {
        throw new Error("refresh failed")
      }),
    ).rejects.toThrow("refresh failed")
    expect(store.has(key)).toBe(false)
  })

  it("queues calls on one instance instead of polling Redis against each other", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const first = redisRequestLock(name, () => gate)
    const second = redisRequestLock(name, () => "second")

    try {
      await new Promise((r) => setTimeout(r, 50))
      expect(store.has(key)).toBe(true)
      expect(mockRedis.set).toHaveBeenCalledTimes(1)
    } finally {
      release()
    }
    await first
    await expect(second).resolves.toBe("second")
    expect(mockRedis.set).toHaveBeenCalledTimes(2)
  })

  it("treats its own key as acquired when a SET response was lost and retried", async () => {
    // The first SET landed but its response was lost; the client's retry
    // then sees the key and NX returns null.
    mockRedis.set.mockImplementationOnce(async (k: string, v: string) => {
      store.set(k, v)
      return null
    })
    const start = Date.now()
    await expect(redisRequestLock(name, () => "ok")).resolves.toBe("ok")
    expect(Date.now() - start).toBeLessThan(1_000)
    expect(mockRedis.set).toHaveBeenCalledTimes(1)
  })

  it("renews the TTL while fn runs and stops after release", async () => {
    vi.useFakeTimers()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const pending = Promise.resolve(redisRequestLock(name, () => gate))

    await vi.advanceTimersByTimeAsync(20_000)
    expect(renewCalls().length).toBe(4)
    expect(renewCalls()[0][2]).toEqual([store.get(key), "15000"])

    release()
    await pending
    await vi.advanceTimersByTimeAsync(20_000)
    expect(renewCalls().length).toBe(4)
  })

  it("waits at least one TTL for a stuck holder, then gives up with a transient error", async () => {
    vi.useFakeTimers()
    store.set(key, "stuck")
    let settled = false
    const pending = Promise.resolve(redisRequestLock(name, () => "never")).finally(() => {
      settled = true
    })
    const assertion = expect(pending).rejects.toBeInstanceOf(RequestLockTimeoutError)

    await vi.advanceTimersByTimeAsync(44_000)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(2_000)
    await assertion
  })

  it("does not fail the call when the release fails", async () => {
    const err = new Error("redis down")
    mockRedis.eval.mockRejectedValueOnce(err)

    await expect(redisRequestLock(name, () => "ok")).resolves.toBe("ok")
    expect(logSafe).toHaveBeenCalledWith("[oauth-lock] release failed", err)
  })
})
