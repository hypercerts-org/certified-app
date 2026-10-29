import { randomUUID } from "node:crypto"
import { requestLocalLock, type RuntimeLock } from "@atproto/oauth-client-node"
import { logSafe } from "@/lib/utils/log-safe"
import { getRedis } from "./stores"

/**
 * Distributed `requestLock` for the OAuth client (TECH-807).
 *
 * The client takes this lock around every session read for a DID, and a
 * read may refresh the tokens. Refresh tokens rotate and are single-use: if
 * two Vercel instances refresh the same session at once, the loser sends an
 * already-used token, the authorization server treats it as replay and the
 * session is revoked. Without a lock the client logs "No lock mechanism
 * provided. Credentials might get revoked."
 *
 * Calls on one instance queue in-process (requestLocalLock) so they don't
 * poll Redis against each other; across instances the lock is a Redis key
 * set with NX and a TTL, owned by a random token and released only by its
 * owner. Configuring a lock turns off the client's own recovery for a
 * concurrent refresh, so the lock must stay held for as long as `fn` runs:
 * the refresh request has no timeout of its own. The holder renews the TTL
 * while it works; the TTL only bounds how long a crashed holder blocks.
 */

const KEY_PREFIX = "oauth:lock:"
const LOCK_TTL_MS = 15_000
/** Renew well before the TTL lapses, leaving room for a slow round trip. */
const RENEW_EVERY_MS = 5_000
/** How long a caller waits for another holder before giving up (503). */
const LOCK_WAIT_MS = 45_000
/** The usual holder keeps the lock for a couple of Redis round trips, so
 *  start polling fast and back off. */
const RETRY_MIN_MS = 5
const RETRY_MAX_MS = 150

// Both scripts act only while the key still holds our token: after a TTL
// lapse another instance may own it.
const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`
const RENEW_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`

/** Thrown when the lock stays held past LOCK_WAIT_MS. Restore callers treat
 *  it as transient (isSessionGone), never as a revoked session. */
export class RequestLockTimeoutError extends Error {
  constructor(name: string) {
    super(`Timed out waiting for the OAuth request lock (${name})`)
    this.name = "RequestLockTimeoutError"
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function acquire(key: string, token: string, name: string): Promise<void> {
  const redis = getRedis()
  const deadline = Date.now() + LOCK_WAIT_MS
  let delay = RETRY_MIN_MS
  for (;;) {
    if (await redis.set(key, token, { nx: true, px: LOCK_TTL_MS })) return
    // The Upstash client retries a request whose response was lost; if the
    // first SET landed, the retry sees our own key. Don't wait on ourselves.
    if ((await redis.get<string>(key)) === token) return
    if (Date.now() >= deadline) throw new RequestLockTimeoutError(name)
    await sleep(delay * (0.5 + Math.random()))
    delay = Math.min(delay * 2, RETRY_MAX_MS)
  }
}

async function withRedisLock<T>(
  name: string,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  const redis = getRedis()
  const key = `${KEY_PREFIX}${name}`
  const token = randomUUID()
  await acquire(key, token, name)

  const renew = setInterval(() => {
    redis.eval(RENEW_SCRIPT, [key], [token, String(LOCK_TTL_MS)]).catch((err: unknown) => {
      logSafe("[oauth-lock] renew failed", err)
    })
  }, RENEW_EVERY_MS)

  try {
    return await fn()
  } finally {
    clearInterval(renew)
    // A failed release only delays the next holder until the TTL lapses.
    await redis.eval(RELEASE_SCRIPT, [key], [token]).catch((err: unknown) => {
      logSafe("[oauth-lock] release failed", err)
    })
  }
}

export const redisRequestLock: RuntimeLock = (name, fn) =>
  requestLocalLock(name, () => withRedisLock(name, fn))
