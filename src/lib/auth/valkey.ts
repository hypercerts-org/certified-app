import "server-only";

import { createClient } from "redis";
import { oauthMode } from "@/lib/auth/config";
import { logError } from "@/lib/log";

// Valkey, shared by every server instance: OAuth state, OAuth sessions, the
// token-refresh lock, app sessions and the sign-in rate limit. Valkey speaks
// the Redis protocol, so the standard `redis` client connects to it, and any
// Redis-compatible provider works. VALKEY_URL is a redis:// (or rediss://) URL;
// without it, REDIS_URL, the name the Vercel Marketplace's Redis integrations
// (Upstash, Redis Cloud) set.

function createValkey(url: string) {
  return createClient({
    url,
    // Fail a command at once while disconnected instead of queueing it, so an
    // outage fails the request rather than hanging it.
    disableOfflineQueue: true,
    socket: { connectTimeout: 5_000 },
  }).on("error", (err) => logError("[valkey]", err));
}

type Client = ReturnType<typeof createValkey>;

let connecting: Promise<Client> | undefined;

/** One connection per server instance, reopened after a failed connect. */
function connect(): Promise<Client> {
  if (!connecting) {
    const url = process.env.VALKEY_URL || process.env.REDIS_URL;
    if (!url) throw new Error("VALKEY_URL (or REDIS_URL) is not set.");
    const pending = createValkey(url).connect();
    pending.catch(() => {
      connecting = undefined;
    });
    connecting = pending;
  }
  return connecting;
}

/** Valkey could not be reached or rejected a command. Always transient. */
export class StoreUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Valkey request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "StoreUnavailableError";
  }
}

/**
 * Runs Valkey commands and replaces any failure with StoreUnavailableError.
 * Otherwise a network failure could surface as a bare TypeError, which the
 * OAuth client reads as a corrupt session and deletes.
 */
export async function store<T>(call: (valkey: Client) => Promise<T>): Promise<T> {
  try {
    return await call(await connect());
  } catch (err) {
    throw new StoreUnavailableError(err);
  }
}

/**
 * A key in this deployment's namespace: its OAuth client's origin (the public
 * URL's host, or "loopback" locally). Sessions belong to one client, so
 * deployments that share a database (production and previews, say) must not
 * read or revoke each other's: a sign-in on a preview would otherwise replace
 * the production session of the same account. It does not make sharing a
 * database safe: give production a database of its own.
 */
export function storeKey(key: string): string {
  const mode = oauthMode();
  const namespace = mode.kind === "web" ? new URL(mode.publicUrl).host : "loopback";
  return `${namespace}:${key}`;
}
