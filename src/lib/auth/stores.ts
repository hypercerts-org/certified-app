import type { NodeSavedState, NodeSavedSession } from "@atproto/oauth-client-node"
import { Redis } from "@upstash/redis"

/**
 * Minimal subset of the Upstash Redis client surface this app uses.
 * Both the real `Redis` instance and the in-memory dev fallback satisfy it.
 */
type RedisLike = {
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>
  get<T>(key: string): Promise<T | null>
  del(key: string): Promise<unknown>
}

/**
 * Process-local in-memory store with TTL semantics that match Upstash's
 * `set(key, value, { ex })`. Used as a dev fallback so a fresh clone can
 * sign in locally without provisioning an Upstash database.
 *
 * Caveats this is fine with for dev and NOT fine with for production:
 *   - state is per-process, so it doesn't survive a server restart
 *   - state isn't shared across Next.js workers / serverless invocations
 *   - no eviction beyond TTL, but the store is bounded by sign-in volume
 */
class InMemoryRedis implements RedisLike {
  private readonly store = new Map<string, { value: string; expiresAt?: number }>()

  async set(key: string, value: string, opts?: { ex?: number }): Promise<"OK"> {
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : undefined
    this.store.set(key, { value, expiresAt })
    return "OK"
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt !== undefined && entry.expiresAt < Date.now()) {
      this.store.delete(key)
      return null
    }
    // Mirror Upstash's behaviour for `.get<string>(key)`: hand back the
    // raw stored string. Callers JSON.parse where needed.
    return entry.value as T
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0
  }
}

// Lazy singleton — created on first use so the module can be imported
// without UPSTASH env vars being present at import time.
let _redis: RedisLike | null = null
function getRedis(): RedisLike {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (url && token) {
      _redis = new Redis({ url, token })
    } else if (process.env.NODE_ENV !== "production") {
      // Dev fallback — in-memory stores so sign-in works without Upstash.
      console.warn(
        "[stores] UPSTASH_REDIS_REST_URL/TOKEN not set \u2014 using in-memory store. " +
          "OAuth state and sessions will be lost on every dev server restart. " +
          "Set real Upstash creds in .env.local for persistent dev sessions."
      )
      _redis = new InMemoryRedis()
    } else {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required"
      )
    }
  }
  return _redis
}

const STATE_PREFIX = "oauth:state:"
const SESSION_PREFIX = "oauth:session:"

/**
 * Redis-backed state store for OAuth authorization flow.
 * States are short-lived (10 min TTL) — they only need to survive
 * from authorize() to callback().
 */
export class RedisStateStore {
  private readonly ttlSeconds: number

  constructor(ttlSeconds: number = 600) {
    this.ttlSeconds = ttlSeconds
  }

  async set(key: string, value: NodeSavedState): Promise<void> {
    await getRedis().set(`${STATE_PREFIX}${key}`, JSON.stringify(value), {
      ex: this.ttlSeconds,
    })
  }

  async get(key: string): Promise<NodeSavedState | undefined> {
    const data = await getRedis().get<string>(`${STATE_PREFIX}${key}`)
    if (!data) return undefined
    return typeof data === "string" ? JSON.parse(data) : data
  }

  async del(key: string): Promise<void> {
    await getRedis().del(`${STATE_PREFIX}${key}`)
  }
}

/**
 * Redis-backed session store for OAuth sessions (tokens, DPoP keys).
 * Sessions are long-lived (30 day TTL, refreshed on each set).
 */
export class RedisSessionStore {
  private readonly ttlSeconds: number

  constructor(ttlSeconds: number = 60 * 60 * 24 * 30) {
    this.ttlSeconds = ttlSeconds
  }

  async set(key: string, value: NodeSavedSession): Promise<void> {
    await getRedis().set(`${SESSION_PREFIX}${key}`, JSON.stringify(value), {
      ex: this.ttlSeconds,
    })
  }

  async get(key: string): Promise<NodeSavedSession | undefined> {
    const data = await getRedis().get<string>(`${SESSION_PREFIX}${key}`)
    if (!data) return undefined
    return typeof data === "string" ? JSON.parse(data) : data
  }

  async del(key: string): Promise<void> {
    await getRedis().del(`${SESSION_PREFIX}${key}`)
  }
}

// Re-export the Redis getter for use in session.ts
export { getRedis }
