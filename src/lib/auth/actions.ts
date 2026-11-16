"use server";

import { redirect } from "next/navigation";
import { forgetMemberships } from "@/lib/cgs";
import { logError } from "@/lib/log";
import { returnPath } from "@/lib/validate";
import { CERTIFIED_PDS_URL } from "./config";
import { endAppSession, readAppSession } from "./session";
import { signInUrl } from "./start-sign-in";

/**
 * Starts sign-in at Certified's PDS, whose own page offers an email code,
 * Google, or a handle on any AT Protocol server ("Sign in with Atmosphere",
 * handed back to /oauth/handle-login). A browser already signed in there
 * returns at once. Redirects either way: to the authorization page, or to the
 * sign-in page saying why it couldn't start.
 */
export async function signIn(request: { returnTo: string }): Promise<never> {
  redirect(await signInUrl({ server: CERTIFIED_PDS_URL }, returnPath(request?.returnTo)));
}

/**
 * Signs this browser out and goes to `next` (a path on this site, default
 * the home page). The account's OAuth tokens are shared by all its browsers,
 * so they are revoked only when this was the last one.
 */
export async function signOut(form?: FormData): Promise<void> {
  try {
    const session = await readAppSession();
    await endAppSession({ revokeIfLast: true });
    if (session) await forgetMemberships(session.did);
  } catch (err) {
    // The cookie is already cleared; a Valkey failure leaves at most an orphaned
    // session record, which expires.
    logError("[auth] sign-out cleanup failed", err);
  }
  redirect(returnPath(form?.get("next")));
}
