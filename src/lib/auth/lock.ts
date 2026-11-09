import "server-only";

import { randomUUID } from "node:crypto";
import { type RuntimeLock, requestLocalLock } from "@atproto/oauth-client-node";
import { logError } from "@/lib/log";
import { redis } from "./redis";

// The OAuth client's requestLock, shared across server instances.
//
// The client takes the lock around every session read for a DID, and a read
// may refresh the tokens. Refresh tokens rotate and are single-use: if two
// instances refresh the same session at once, the second sends a used token,
// the authorization server treats it as replay and revokes the session.
//
// Calls on one instance queue in-process first; across instances the lock is a
// Redis key set with NX and a TTL, owned by a random token and released only by
// its owner. With a lock configured the client no longer tries to recover from
// a concurrent refresh itself, so the holder renews the TTL for as long as it
// works. The TTL only bounds how long a crashed holder blocks others.

const KEY_PREFIX = "oauth:lock:";
const LOCK_TTL_MS = 15_000;
const RENEW_EVERY_MS = 5_000;
const WAIT_MS = 45_000;
const RETRY_MIN_MS = 5;
const RETRY_MAX_MS = 150;

// Both act only while the key still holds our token.
const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
const RENEW = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`;

/** The lock stayed held too long. Callers treat it as transient, never as a
 *  revoked session. */
export class LockTimeoutError extends Error {
  constructor(name: string) {
    super(`Timed out waiting for the OAuth request lock (${name})`);
    this.name = "LockTimeoutError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquire(key: string, token: string, name: string) {
  const deadline = Date.now() + WAIT_MS;
  let delay = RETRY_MIN_MS;
  for (;;) {
    if (await redis().set(key, token, { nx: true, px: LOCK_TTL_MS })) return;
    // Upstash retries a request whose response was lost; if our first SET
    // landed, the retry finds our own token. Don't wait on ourselves.
    if ((await redis().get<string>(key)) === token) return;
    if (Date.now() >= deadline) throw new LockTimeoutError(name);
    await sleep(delay * (0.5 + Math.random()));
    delay = Math.min(delay * 2, RETRY_MAX_MS);
  }
}

async function withRedisLock<T>(name: string, fn: () => T | PromiseLike<T>): Promise<T> {
  const key = KEY_PREFIX + name;
  const token = randomUUID();
  await acquire(key, token, name);
  const renew = setInterval(() => {
    redis()
      .eval(RENEW, [key], [token, String(LOCK_TTL_MS)])
      .catch((err: unknown) => logError("[oauth-lock] renew failed", err));
  }, RENEW_EVERY_MS);
  try {
    return await fn();
  } finally {
    clearInterval(renew);
    // A failed release only delays the next holder until the TTL lapses.
    await redis()
      .eval(RELEASE, [key], [token])
      .catch((err: unknown) => logError("[oauth-lock] release failed", err));
  }
}

export const requestLock: RuntimeLock = (name, fn) =>
  requestLocalLock(name, () => withRedisLock(name, fn));
