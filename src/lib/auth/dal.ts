// The data access layer for authentication. Pages, components and Server
// Actions ask these functions who is signed in; nothing else reads the session
// cookie or restores OAuth sessions.
import "server-only";

import type { OAuthSession } from "@atproto/oauth-client-node";
import { cache } from "react";
import { logError } from "@/lib/log";
import { getOAuthClient } from "./oauth-client";
import { isSessionGone, SessionUnavailableError } from "./restore-error";
import { destroyAppSession, readAppSession } from "./session";

export type User = { did: string };

/**
 * The signed-in account, or null. Reads the app session only, no PDS or
 * authorization server calls, so it is cheap enough for every render. Reading
 * the cookie makes the caller dynamic: keep it inside a Suspense boundary so
 * public pages keep their cached shell.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const session = await readAppSession();
  return session ? { did: session.did } : null;
});

/**
 * The signed-in user's OAuth session, for calls to their PDS. Refreshes the
 * tokens when they are about to expire. Returns null, and ends the app session,
 * when the OAuth session is gone (revoked, expired, or signed out on another
 * device). Throws SessionUnavailableError when it exists but can't be reached
 * right now, which must not sign the user out.
 */
export const getOAuthSession = cache(async (): Promise<OAuthSession | null> => {
  const user = await getUser();
  if (!user) return null;
  const client = await getOAuthClient();
  try {
    return await client.restore(user.did);
  } catch (err) {
    if (await isSessionGone(err, user.did)) {
      await destroyAppSession({ clearCookie: false });
      return null;
    }
    logError("[auth] restore failed", err, { did: user.did });
    throw new SessionUnavailableError({ cause: err });
  }
});
