import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * The OAuth client's distributed requestLock (TECH-807). A fake Redis keeps
 * the SET NX PX / owner-checked release semantics, so "another instance"
 * is simulated by writing the lock key directly.
 */

const store = new Map<string, string>()
const mockRedis = {
  set: vi.fn(async (key: string, value: string, opts: { nx?: boolean; px?: number }) => {
    if (opts?.nx && store.has(key)) return null
    store.set(key, value)
    return "OK"
  }),
  eval: vi.fn(async (_script: string, keys: string[], args: string[]) => {
    if (store.get(keys[0]) !== args[0]) return 0
    store.delete(keys[0])
    return 1
  }),
}

vi.mock("@/lib/auth/stores", () => ({
  getRedis: () => mockRedis,
  RedisStateStore: class {},
  RedisSessionStore: class {},
}))

const { NodeOAuthClient } = vi.hoisted(() => ({ NodeOAuthClient: vi.fn() }))
vi.mock("@atproto/oauth-client-node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@atproto/oauth-client-node")>()),
  NodeOAuthClient,
}))

import { redisRequestLock, RequestLockTimeoutError } from "../request-lock"

const NAME = "@atproto-oauth-client-did:plc:alice"
const KEY = `oauth:lock:${NAME}`

beforeEach(() => {
  store.clear()
  mockRedis.set.mockClear()
  mockRedis.eval.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("redisRequestLock", () => {
  it("holds the Redis key while fn runs and releases it after", async () => {
    let heldDuring: string | undefined
    const result = await redisRequestLock(NAME, () => {
      heldDuring = store.get(KEY)
      return "done"
    })

    expect(result).toBe("done")
    expect(heldDuring).toBeTruthy()
    expect(mockRedis.set).toHaveBeenCalledWith(KEY, heldDuring, { nx: true, px: 45_000 })
    expect(store.has(KEY)).toBe(false)
  })

  it("waits while another instance holds the lock", async () => {
    store.set(KEY, "other-instance")
    const fn = vi.fn(() => "ran")
    const pending = redisRequestLock(NAME, fn)

    await new Promise((r) => setTimeout(r, 200))
    expect(fn).not.toHaveBeenCalled()

    store.delete(KEY)
    await expect(pending).resolves.toBe("ran")
    expect(mockRedis.set.mock.calls.length).toBeGreaterThan(1)
  })

  it("does not delete a lock another instance took over after a TTL lapse", async () => {
    await redisRequestLock(NAME, () => {
      store.set(KEY, "new-owner")
    })
    expect(store.get(KEY)).toBe("new-owner")
  })

  it("releases the lock when fn throws", async () => {
    await expect(
      redisRequestLock(NAME, () => {
        throw new Error("refresh failed")
      }),
    ).rejects.toThrow("refresh failed")
    expect(store.has(KEY)).toBe(false)
  })

  it("queues calls on one instance instead of polling Redis against each other", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const first = redisRequestLock(NAME, () => gate)
    const second = redisRequestLock(NAME, () => "second")

    await new Promise((r) => setTimeout(r, 50))
    expect(mockRedis.set).toHaveBeenCalledTimes(1)

    release()
    await first
    await expect(second).resolves.toBe("second")
    expect(mockRedis.set).toHaveBeenCalledTimes(2)
  })

  it("gives up with a transient error once a held lock outlasts the wait", async () => {
    vi.useFakeTimers()
    store.set(KEY, "stuck")
    const pending = Promise.resolve(redisRequestLock(NAME, () => "never"))
    const assertion = expect(pending).rejects.toBeInstanceOf(RequestLockTimeoutError)

    await vi.advanceTimersByTimeAsync(46_000)
    await assertion
    // /api/auth/session deletes the session on messages like these; a lock
    // timeout must stay a transient failure.
    const err = await pending.catch((e: Error) => e)
    expect((err as Error).message).not.toMatch(/invalid[_ ]?token|revoked|expired/i)
  })

  it("does not fail the call when the release fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mockRedis.eval.mockRejectedValueOnce(new Error("redis down"))

    await expect(redisRequestLock(NAME, () => "ok")).resolves.toBe("ok")
    expect(warn).toHaveBeenCalledWith("[oauth-lock] release failed", "redis down")
    warn.mockRestore()
  })
})

describe("getOAuthClient", () => {
  it("passes the Redis request lock to the OAuth client", async () => {
    const { getOAuthClient } = await import("../oauth-client")
    await getOAuthClient()

    expect(NodeOAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({ requestLock: redisRequestLock }),
    )
  })
})
