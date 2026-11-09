import "server-only";

import { isExpectedSessionError, TokenRefreshError } from "@atproto/oauth-client-node";
import { sessionStore } from "./stores";

// The client reports a session-store read that returned nothing with this
// message, and a Redis outage looks the same to it. Check the store before
// treating it as gone.
const MISSING_SESSION = "The session was deleted by another process";

/**
 * Whether a failed `client.restore(did)` means the OAuth session is really
 * gone (sign the user out) rather than temporarily unreachable (keep the
 * session and fail this request). The client rethrows network errors, Redis
 * errors and lock timeouts as they are, so only its own session errors count.
 */
export async function isSessionGone(err: unknown, did: string): Promise<boolean> {
  if (err instanceof TokenRefreshError && err.message === MISSING_SESSION) {
    try {
      return (await sessionStore.get(did)) === undefined;
    } catch {
      return false;
    }
  }
  return isExpectedSessionError(err);
}

/** The session exists but can't be used right now. Not a sign-out. */
export class SessionUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Session temporarily unavailable", options);
    this.name = "SessionUnavailableError";
  }
}
