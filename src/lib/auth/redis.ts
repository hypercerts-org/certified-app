import "server-only";

import { Redis } from "@upstash/redis";

let client: Redis | undefined;

/**
 * Upstash Redis, shared by every server instance: OAuth state, OAuth sessions,
 * the token-refresh lock and app sessions. Reads UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN on first use, so importing this module needs no env.
 */
export function redis(): Redis {
  client ??= Redis.fromEnv();
  return client;
}
