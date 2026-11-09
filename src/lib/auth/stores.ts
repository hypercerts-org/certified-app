import "server-only";

import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import { store } from "./redis";

// The OAuth client's stores, as JSON strings in Redis.

/** A JSON value under a key prefix, expiring `ttlSeconds` after each write. */
function jsonStore<T>(prefix: string, ttlSeconds: number) {
  return {
    async get(key: string): Promise<T | undefined> {
      const raw = await store((r) => r.get(prefix + key));
      return raw ? (JSON.parse(raw) as T) : undefined;
    },
    async set(key: string, value: T): Promise<void> {
      await store((r) =>
        r.set(prefix + key, JSON.stringify(value), {
          expiration: { type: "EX", value: ttlSeconds },
        }),
      );
    },
    async del(key: string): Promise<void> {
      await store((r) => r.del(prefix + key));
    },
  };
}

/** An authorization only has to survive the round trip to the server. */
export const stateStore: NodeSavedStateStore = jsonStore<NodeSavedState>("oauth:state:", 10 * 60);

/**
 * Keyed by DID: the account's tokens and DPoP key. Every browser signed in to
 * the account shares them; the client revokes the previous set when the
 * account signs in again. Renewed on every token refresh, so only idle
 * sessions expire.
 */
export const sessionStore: NodeSavedSessionStore = jsonStore<NodeSavedSession>(
  "oauth:session:",
  30 * 24 * 60 * 60,
);
