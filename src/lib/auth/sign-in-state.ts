import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { returnPath } from "@/lib/validate";
import { cookieOptions } from "./config";

// Binds an authorization to the browser that started it (RFC 9700, 4.7).
// The OAuth client keeps its state server-side and accepts any callback whose
// state it knows, so without this an attacker could send a victim the
// callback link of a sign-in the attacker completed, and the victim would be
// signed in to the attacker's account. A random nonce goes both into a cookie
// and into the app state the client returns at the callback; they must match.

// Resolved per request: the flags depend on runtime configuration.
const cookie = () => cookieOptions("certified_sign_in");
const TTL_SECONDS = 10 * 60;

type AppState = { nonce: string; returnTo: string };

/** The app state for `authorize()`. Only in a Server Action. */
export async function beginSignIn(returnTo: string): Promise<string> {
  const nonce = randomBytes(16).toString("base64url");
  (await cookies()).set(cookie().name, nonce, { ...cookie().options, maxAge: TTL_SECONDS });
  return JSON.stringify({ nonce, returnTo } satisfies AppState);
}

function parse(state: string | null | undefined): AppState | null {
  try {
    const value = JSON.parse(state ?? "");
    return typeof value?.nonce === "string"
      ? { nonce: value.nonce, returnTo: returnPath(value.returnTo) }
      : null;
  } catch {
    return null;
  }
}

/**
 * Checks the callback's app state against this browser's cookie and clears
 * the cookie. Returns the return path, or null when the sign-in was not
 * started in this browser. Only in a Route Handler.
 */
export async function completeSignIn(state: string | null): Promise<string | null> {
  const store = await cookies();
  const nonce = store.get(cookie().name)?.value;
  store.set(cookie().name, "", { ...cookie().options, maxAge: 0 });
  const parsed = parse(state);
  return parsed && nonce && parsed.nonce === nonce ? parsed.returnTo : null;
}

/** The return path from a failed callback's app state, unverified: only used
 *  to send the visitor back to the sign-in page. */
export function returnPathFromState(state: string | undefined): string {
  return parse(state)?.returnTo ?? "/";
}
