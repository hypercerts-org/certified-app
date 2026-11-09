"use server";

import { OAuthResolverError } from "@atproto/oauth-client-node";
import { redirect } from "next/navigation";
import { logError } from "@/lib/log";
import { returnPath } from "@/lib/validate";
import { CERTIFIED_PDS_URL, OAUTH_SCOPE } from "./config";
import { getOAuthClient } from "./oauth-client";
import { destroyAppSession } from "./session";

export type SignInState = { error: string | null };

// A simple shape check only: Certified's sign-in page validates the address.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Starts sign-in and redirects to the account's authorization server. An email
 * address (or nothing) signs in with a Certified account; anything else is
 * treated as a handle or DID on any PDS. The return path travels in the OAuth
 * state and comes back to the callback.
 */
export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const input = String(form.get("identifier") ?? "")
    .trim()
    .replace(/^@/, "");
  const state = returnPath(form.get("returnTo"));
  if (input.length > 254) return { error: "That is too long for an email address or handle." };

  const isHandle = input !== "" && !EMAIL.test(input);
  let url: URL;
  try {
    const client = await getOAuthClient();
    if (!isHandle) {
      url = await client.authorize(CERTIFIED_PDS_URL, { scope: OAUTH_SCOPE, state });
      // The client reserves login_hint for handles, so it is not in the pushed
      // request. Certified's sign-in page reads it from the URL instead.
      if (input) url.searchParams.set("login_hint", input);
    } else {
      url = await client.authorize(input, { scope: OAUTH_SCOPE, state });
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
 * Signs this browser out. The OAuth session is shared by every browser signed
 * in to the same account, so it is not revoked here; revoking it would sign
 * the account out everywhere.
 */
export async function signOut(): Promise<void> {
  await destroyAppSession({ clearCookie: true });
  redirect("/");
}
