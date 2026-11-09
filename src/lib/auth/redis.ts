import "server-only";

import { createClient } from "redis";
import { logError } from "@/lib/log";

// Redis, shared by every server instance: OAuth state, OAuth sessions, the
// token-refresh lock, app sessions and the sign-in rate limit. Any Redis
// provider works; REDIS_URL is the standard connection string.

function createRedis(url: string) {
  return createClient({
    url,
    // Fail a command at once while disconnected instead of queueing it, so an
    // outage fails the request rather than hanging it.
    disableOfflineQueue: true,
    socket: { connectTimeout: 5_000 },
  }).on("error", (err) => logError("[redis]", err));
}

type Client = ReturnType<typeof createRedis>;

let connecting: Promise<Client> | undefined;

/** One connection per server instance, reopened after a failed connect. */
function connect(): Promise<Client> {
  if (!connecting) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set.");
    const pending = createRedis(url).connect();
    pending.catch(() => {
      connecting = undefined;
    });
    connecting = pending;
  }
  return connecting;
}

/** Redis could not be reached or rejected a command. Always transient. */
export class StoreUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Redis request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "StoreUnavailableError";
  }
}

/**
 * Runs Redis commands and replaces any failure with StoreUnavailableError.
 * Otherwise a network failure could surface as a bare TypeError, which the
 * OAuth client reads as a corrupt session and deletes.
 */
export async function store<T>(call: (redis: Client) => Promise<T>): Promise<T> {
  try {
    return await call(await connect());
  } catch (err) {
    throw new StoreUnavailableError(err);
  }
}
