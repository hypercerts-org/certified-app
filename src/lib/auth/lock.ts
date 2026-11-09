import "server-only";

import { randomUUID } from "node:crypto";
import { type RuntimeLock, requestLocalLock } from "@atproto/oauth-client-node";
import { logError } from "@/lib/log";
import { store } from "./redis";

// The OAuth client's requestLock, shared across server instances.
//
// The client takes the lock around every session read for a DID, and a read
// may refresh the tokens. Refresh tokens are single-use: if two instances
// refresh the same session at once, the second replays a used token and the
// authorization server revokes the session. Calls on one instance queue
// in-process first; across instances a Redis key with a fixed 45 second lease
// serializes them, the pattern the @atproto/oauth-client-node README shows.
// The client's own timeouts keep the work under the lock well below that.
//
// Two Redis commands, so no library: redlock targets ioredis, and
// @upstash/lock needs Upstash-hosted Redis.

const LEASE_MS = 45_000;
const RETRY_DELAY_MS = 50;

// Delete the key only while it still holds our token: once the lease has
// lapsed, another instance may own it.
const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/** Another instance held the lock for the whole lease. Transient, not a
 *  revoked session. */
export class LockTimeoutError extends Error {
  constructor(name: string) {
    super(`Timed out waiting for the OAuth request lock (${name})`);
    this.name = "LockTimeoutError";
  }
}

async function acquire(key: string, token: string, name: string) {
  const deadline = Date.now() + LEASE_MS;
  const set = { condition: "NX", expiration: { type: "PX", value: LEASE_MS } } as const;
  while (!(await store((r) => r.set(key, token, set)))) {
    if (Date.now() >= deadline) throw new LockTimeoutError(name);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}

export const requestLock: RuntimeLock = (name, fn) =>
  requestLocalLock(name, async () => {
    const key = `oauth:lock:${name}`;
    const token = randomUUID();
    await acquire(key, token, name);
    try {
      return await fn();
    } finally {
      // A failed release only delays the next holder until the lease ends.
      await store((r) => r.eval(RELEASE, { keys: [key], arguments: [token] })).catch((err) =>
        logError("[oauth-lock] release failed", err),
      );
    }
  });
