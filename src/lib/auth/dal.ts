// The data access layer for authentication. Pages, components and Server
// Actions ask these functions who is signed in; nothing else reads the session
// cookie or restores OAuth sessions.
import "server-only";

import { isExpectedSessionError, type OAuthSession } from "@atproto/oauth-client-node";
import { connection } from "next/server";
import { logError } from "@/lib/log";
import { getOAuthClient } from "./oauth-client";
import { endAppSession, readAppSession } from "./session";

export type User = { did: string };

/**
 * The signed-in account, or null, from the app session alone. Cached privately
 * per browser session; callers read the request, so render them inside a
 * Suspense boundary.
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

/** Restores the user's OAuth session, or "gone" when it can no longer be used. */
async function restore(did: string): Promise<OAuthSession | "gone"> {
  try {
    return await (await getOAuthClient()).restore(did);
  } catch (err) {
    // The client's own definition of an unusable session. Redis and network
    // failures never match it: the stores wrap them in StoreUnavailableError.
    if (isExpectedSessionError(err)) return "gone";
    logError("[auth] restore failed", err, { did });
    throw new SessionUnavailableError();
  }
}

/**
 * The signed-in user's OAuth session, for PDS calls from Server Actions and
 * Route Handlers. A gone OAuth session ends the app session too (null); an
 * unreachable one throws SessionUnavailableError and the user stays signed in.
 */
export async function getOAuthSession(): Promise<OAuthSession | null> {
  const user = await getUser();
  if (!user) return null;
  const session = await restore(user.did);
  if (session !== "gone") return session;
  await endAppSession({ revokeIfLast: false });
  return null;
}

/**
 * The same for Server Components, which must not end sessions (a mutation is
 * never a side effect of rendering): a gone OAuth session reads as "expired"
 * and the page offers to sign in again.
 */
export async function readOAuthSession(): Promise<OAuthSession | "expired" | null> {
  const user = await getUser();
  if (!user) return null;
  // Restoring may refresh tokens and take a lock: never during prerendering.
  await connection();
  const session = await restore(user.did);
  return session === "gone" ? "expired" : session;
}
