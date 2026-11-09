import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redis } from "./redis";
import { SESSION_TTL_SECONDS } from "./stores";

// The app session: which account this browser is signed in as.
//
// The cookie holds a random 256-bit token. Redis stores the session under the
// token's SHA-256 hash, so a leaked Redis snapshot contains no usable cookie
// values, and no signing secret has to be configured or rotated. The OAuth
// tokens themselves live in the OAuth session store, keyed by DID.

const COOKIE = "certified_session";
const KEY_PREFIX = "session:";

export type AppSession = { did: string; createdAt: string };

function key(token: string) {
  return KEY_PREFIX + createHash("sha256").update(token).digest("hex");
}

/** Only in a Server Action or Route Handler, which can set cookies. */
export async function createAppSession(did: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const session: AppSession = { did, createdAt: new Date().toISOString() };
  await redis().set(key(token), session, { ex: SESSION_TTL_SECONDS });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function readAppSession(): Promise<AppSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return (await redis().get<AppSession>(key(token))) ?? null;
}

/**
 * Ends the session in Redis. Server Components can't change cookies, so the
 * cookie is cleared only when `clearCookie` is set (Server Actions and Route
 * Handlers); a cookie whose session is gone reads as signed out anyway.
 */
export async function destroyAppSession({ clearCookie }: { clearCookie: boolean }) {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await redis().del(key(token));
  if (clearCookie) store.delete(COOKIE);
}
