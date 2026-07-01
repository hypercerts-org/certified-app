import type { NodeSavedState, NodeSavedSession } from "@atproto/oauth-client-node"
import { Redis } from "@upstash/redis"

// Lazy singleton — created on first use so the module can be imported
// without UPSTASH env vars being present at import time.
let _redis: Redis | null = null
function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required"
      )
    }
    _redis = new Redis({ url, token })
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
