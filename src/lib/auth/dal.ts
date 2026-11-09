// The data access layer for authentication. Pages, components and Server
// Actions ask these functions who is signed in; nothing else reads the session
// cookie or restores OAuth sessions.
import "server-only";

import { isExpectedSessionError, type OAuthSession } from "@atproto/oauth-client-node";
import { logError } from "@/lib/log";
import { getOAuthClient } from "./oauth-client";
import { endAppSession, readAppSession } from "./session";

export type User = { did: string };

/**
 * The signed-in account, or null. Reads the app session only, no PDS or
 * authorization server calls. A private cache keeps the result in the
 * browser, so a signed-in route gets a per-session shell that can be
 * prefetched; signing in or out changes the cookie, which clears it. Callers
 * read the request, so render them inside a Suspense boundary.
 */
export async function getUser(): Promise<User | null> {
  "use cache: private";
  const session = await readAppSession();
  return session ? { did: session.did } : null;
}

/** The session exists but can't be used right now. Not a sign-out. */
export class SessionUnavailableError extends Error {
  constructor() {
    super("Session temporarily unavailable");
    this.name = "SessionUnavailableError";
  }
}

/**
 * The signed-in user's OAuth session, for calls to their PDS. Refreshes the
 * tokens when they are about to expire. When the OAuth session is gone
 * (revoked, expired, or replaced by a broken one) the app session ends too and
 * this returns null; when it can't be reached right now this throws
 * SessionUnavailableError and the user stays signed in. Only in Server Actions
 * and Route Handlers: ending a session is a mutation, never a side effect of
 * rendering.
 */
export async function getOAuthSession(): Promise<OAuthSession | null> {
  const user = await getUser();
  if (!user) return null;
  try {
    return await (await getOAuthClient()).restore(user.did);
  } catch (err) {
    // The client's own definition of an unusable session. Redis and network
    // failures never match it: the stores wrap them in StoreUnavailableError.
    if (isExpectedSessionError(err)) {
      await endAppSession({ revokeIfLast: false });
      return null;
    }
    logError("[auth] restore failed", err, { did: user.did });
    throw new SessionUnavailableError();
  }
}
