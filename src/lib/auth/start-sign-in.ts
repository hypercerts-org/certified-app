import "server-only";

import { OAuthResolverError } from "@atproto/oauth-client-node";
import { ipAddress } from "@vercel/functions";
import { headers } from "next/headers";
import { logError } from "@/lib/log";
import { OAUTH_SCOPE } from "./config";
import { getOAuthClient } from "./oauth-client";
import { beginSignIn } from "./sign-in-state";
import { store } from "./valkey";

// Starting a sign-in: from the header's Sign in button (at Certified's PDS,
// whose page offers an email code, Google, or a handle on any server) and from
// Certified's hand-off when someone signs in with a handle there.

/** Why a sign-in couldn't start or complete, as the sign-in page explains it. */
export type SignInError = "denied" | "failed" | "unavailable" | "busy" | "handle";

/** The sign-in page, explaining `reason`, then returning to `returnTo`. */
export function signInErrorHref(reason: SignInError, returnTo: string): string {
  return `/sign-in?error=${reason}&returnTo=${encodeURIComponent(returnTo)}`;
}

// Starting a sign-in costs DNS, DID and metadata lookups and a Valkey write,
// on behalf of an anonymous visitor: at most 10 per IP address per minute.
// A plain fixed window; @upstash/ratelimit would need Upstash-hosted Redis.
async function allowSignIn(): Promise<boolean> {
  const ip = ipAddress(await headers()) ?? "unknown";
  const key = `ratelimit:sign-in:${ip}:${Math.floor(Date.now() / 60_000)}`;
  const [count] = await store((r) => r.multi().incr(key).expire(key, 60).exec());
  return Number(count) <= 10;
}

/**
 * Where to send the browser: the authorization page of `target` (Certified's
 * PDS, or the server behind a handle), or the sign-in page saying why the
 * sign-in couldn't start. Only in a Server Action or Route Handler.
 */
export async function signInUrl(
  target: { server: string } | { handle: string },
  returnTo: string,
): Promise<string> {
  try {
    if (!(await allowSignIn())) return signInErrorHref("busy", returnTo);
    const client = await getOAuthClient();
    const state = await beginSignIn(returnTo);
    const input = "server" in target ? target.server : target.handle;
    return (await client.authorize(input, { scope: OAUTH_SCOPE, state })).href;
  } catch (err) {
    // A handle that doesn't resolve to an account (or whose server has no
    // OAuth support) is the visitor's to fix; anything else is ours.
    if ("handle" in target && err instanceof OAuthResolverError) {
      return signInErrorHref("handle", returnTo);
    }
    logError("[auth] authorize failed", err);
    return signInErrorHref("unavailable", returnTo);
  }
}
