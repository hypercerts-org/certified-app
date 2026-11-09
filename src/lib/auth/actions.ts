"use server";

import { OAuthResolverError } from "@atproto/oauth-client-node";
import { ipAddress } from "@vercel/functions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logError } from "@/lib/log";
import { returnPath } from "@/lib/validate";
import { CERTIFIED_PDS_URL, OAUTH_SCOPE } from "./config";
import { getOAuthClient } from "./oauth-client";
import { store } from "./redis";
import { endAppSession } from "./session";
import { beginSignIn } from "./sign-in-state";

// A simple shape check only: Certified's sign-in page validates the address.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Starting a sign-in costs DNS, DID and metadata lookups and a Redis write,
// on behalf of an anonymous visitor: at most 10 per IP address per minute.
// A plain fixed window; @upstash/ratelimit would need Upstash-hosted Redis.
async function allowSignIn(ip: string): Promise<boolean> {
  const key = `ratelimit:sign-in:${ip}:${Math.floor(Date.now() / 60_000)}`;
  const [count] = await store((r) => r.multi().incr(key).expire(key, 60).exec());
  return Number(count) <= 10;
}

/**
 * Starts sign-in and redirects to the account's authorization server, or
 * returns why it couldn't. An email address (or nothing) signs in with a
 * Certified account; anything else is treated as a handle or DID on any PDS.
 */
export async function signIn(request: {
  identifier: string;
  returnTo: string;
}): Promise<{ error: string }> {
  const input = String(request?.identifier ?? "")
    .trim()
    .replace(/^@/, "");
  if (input.length > 254) {
    return { error: "That is too long for an email address or handle." };
  }
  const isHandle = input !== "" && !EMAIL.test(input);

  let url: URL;
  try {
    const ip = ipAddress(await headers()) ?? "unknown";
    if (!(await allowSignIn(ip))) {
      return { error: "Too many sign-in attempts. Please wait a minute." };
    }
    const client = await getOAuthClient();
    const state = await beginSignIn(returnPath(request?.returnTo));
    if (isHandle) {
      url = await client.authorize(input, { scope: OAUTH_SCOPE, state });
    } else {
      url = await client.authorize(CERTIFIED_PDS_URL, { scope: OAUTH_SCOPE, state });
      // Not standard OAuth: the client reserves login_hint for handles, so it
      // can't go in the pushed request. Certified's PDS reads it from the
      // authorization URL to prefill the address.
      if (input) url.searchParams.set("login_hint", input);
    }
  } catch (err) {
    // A handle that doesn't resolve to an account (or whose PDS has no OAuth
    // server) is the visitor's to fix; anything else is ours.
    if (isHandle && err instanceof OAuthResolverError) {
      return { error: `We couldn't find an account for ${input}. Check the spelling.` };
    }
    logError("[auth] authorize failed", err);
    return { error: "Sign-in is unavailable right now. Please try again." };
  }
  redirect(url.href);
}

/**
 * Signs this browser out and goes to `next` (a path on this site, default
 * the home page). The account's OAuth tokens are shared by all its browsers,
 * so they are revoked only when this was the last one.
 */
export async function signOut(form?: FormData): Promise<void> {
  try {
    await endAppSession({ revokeIfLast: true });
  } catch (err) {
    // The cookie is already cleared; a Redis failure leaves at most an orphaned
    // session record, which expires.
    logError("[auth] sign-out cleanup failed", err);
  }
  redirect(returnPath(form?.get("next")));
}
