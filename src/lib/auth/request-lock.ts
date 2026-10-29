import { randomUUID } from "node:crypto"
import { requestLocalLock, type RuntimeLock } from "@atproto/oauth-client-node"
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
 * concurrent refresh, so a held lock must outlast the client's 30s timeout.
 */

const KEY_PREFIX = "oauth:lock:"
/** Longer than the client's 30s abort on a session read, plus store writes. */
const LOCK_TTL_MS = 45_000
/** Wait at least one full TTL, so a lock left by a crashed holder lapses. */
const LOCK_WAIT_MS = LOCK_TTL_MS
const RETRY_MIN_MS = 50
const RETRY_MAX_MS = 150

// Delete the key only while it still holds our token: after a TTL lapse
// another instance may own it.
const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`

/** Thrown when the lock stays held past LOCK_WAIT_MS. Its message must not
 *  read as an auth failure, or /api/auth/session would delete the session. */
export class RequestLockTimeoutError extends Error {
  constructor(name: string) {
    super(`Timed out waiting for the OAuth request lock (${name})`)
    this.name = "RequestLockTimeoutError"
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withRedisLock<T>(
  name: string,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  const redis = getRedis()
  const key = `${KEY_PREFIX}${name}`
  const token = randomUUID()
  const deadline = Date.now() + LOCK_WAIT_MS

  while (!(await redis.set(key, token, { nx: true, px: LOCK_TTL_MS }))) {
    if (Date.now() >= deadline) throw new RequestLockTimeoutError(name)
    await sleep(RETRY_MIN_MS + Math.random() * (RETRY_MAX_MS - RETRY_MIN_MS))
  }

  try {
    return await fn()
  } finally {
    // A failed release only delays the next holder until the TTL lapses.
    await redis.eval(RELEASE_SCRIPT, [key], [token]).catch((err: unknown) => {
      console.warn("[oauth-lock] release failed", (err as Error)?.message)
    })
  }
}

export const redisRequestLock: RuntimeLock = (name, fn) =>
  requestLocalLock(name, () => withRedisLock(name, fn))
