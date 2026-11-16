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
// The cookie also keeps the page to return to, so a sign-in handed over to
// another server (Certified's "Sign in with Atmosphere") still returns there.

// Resolved per request: the flags depend on runtime configuration.
const cookie = () => cookieOptions("certified_sign_in");
const TTL_SECONDS = 10 * 60;

type AppState = { nonce: string; returnTo: string };

/** The app state for `authorize()`. Only in a Server Action or Route Handler. */
export async function beginSignIn(returnTo: string): Promise<string> {
  const state = JSON.stringify({
    nonce: randomBytes(16).toString("base64url"),
    returnTo,
  } satisfies AppState);
  (await cookies()).set(cookie().name, Buffer.from(state).toString("base64url"), {
    ...cookie().options,
    maxAge: TTL_SECONDS,
  });
  return state;
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
  const started = await readCookie();
  (await cookies()).set(cookie().name, "", { ...cookie().options, maxAge: 0 });
  const parsed = parse(state);
  return parsed && started && parsed.nonce === started.nonce ? parsed.returnTo : null;
}

/** The sign-in this browser started, from its cookie. */
async function readCookie(): Promise<AppState | null> {
  const value = (await cookies()).get(cookie().name)?.value;
  return value ? parse(Buffer.from(value, "base64url").toString()) : null;
}

/** Where the sign-in this browser started should return, or "/". */
export async function pendingReturnTo(): Promise<string> {
  return (await readCookie())?.returnTo ?? "/";
}

/** The return path from a failed callback's app state, unverified: only used
 *  to send the visitor back to the sign-in page. */
export function returnPathFromState(state: string | undefined): string {
  return parse(state)?.returnTo ?? "/";
}
