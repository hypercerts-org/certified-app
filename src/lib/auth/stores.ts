import "server-only";

import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import { redis } from "./redis";

// The OAuth client's stores. Values are JSON; Upstash serializes them.

const STATE_PREFIX = "oauth:state:";
const SESSION_PREFIX = "oauth:session:";

/** An authorization only has to survive the round trip to the server. */
const STATE_TTL_SECONDS = 10 * 60;
/** Renewed on every token refresh, so only idle sessions expire. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export const stateStore: NodeSavedStateStore = {
  async get(key) {
    return (await redis().get<NodeSavedState>(STATE_PREFIX + key)) ?? undefined;
  },
  async set(key, value) {
    await redis().set(STATE_PREFIX + key, value, { ex: STATE_TTL_SECONDS });
  },
  async del(key) {
    await redis().del(STATE_PREFIX + key);
  },
};

/** Keyed by DID: the user's tokens and DPoP key, one set per account. */
export const sessionStore: NodeSavedSessionStore = {
  async get(did) {
    return (await redis().get<NodeSavedSession>(SESSION_PREFIX + did)) ?? undefined;
  },
  async set(did, value) {
    await redis().set(SESSION_PREFIX + did, value, { ex: SESSION_TTL_SECONDS });
  },
  async del(did) {
    await redis().del(SESSION_PREFIX + did);
  },
};
