import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { logError } from "@/lib/log";
import { cookieOptions } from "./config";
import { getOAuthClient } from "./oauth-client";
import { store } from "./redis";

// The app session: which account this browser is signed in as.
//
// The cookie holds a random 256-bit token. Redis stores the session under the
// token's SHA-256 hash, so a leaked Redis snapshot contains no usable cookie
// values, and no signing secret has to be configured or rotated. The account's
// OAuth tokens live in the OAuth session store, shared by all its browsers;
// each account keeps a set of its browsers' sessions so the tokens can be
// revoked when the last one signs out.

// Resolved per request: the flags depend on runtime configuration.
const cookie = () => cookieOptions("certified_session");
const TTL_SECONDS = 30 * 24 * 60 * 60;

export type AppSession = { did: string; createdAt: string };

const sessionKey = (id: string) => `session:${id}`;
const accountKey = (did: string) => `account-sessions:${did}`;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(cookie().name)?.value;
  return token ? hash(token) : null;
}

/** Only in a Server Action or Route Handler, which can set cookies. */
export async function createAppSession(did: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const id = hash(token);
  const session: AppSession = { did, createdAt: new Date().toISOString() };
  await store((r) =>
    r
      .multi()
      .set(sessionKey(id), JSON.stringify(session), {
        expiration: { type: "EX", value: TTL_SECONDS },
      })
      .sAdd(accountKey(did), id)
      .expire(accountKey(did), TTL_SECONDS)
      .exec(),
  );
  (await cookies()).set(cookie().name, token, { ...cookie().options, maxAge: TTL_SECONDS });
}

async function readAppSessionById(id: string): Promise<AppSession | null> {
  const raw = await store((r) => r.get(sessionKey(id)));
  return raw ? (JSON.parse(raw) as AppSession) : null;
}

export async function readAppSession(): Promise<AppSession | null> {
  const id = await currentSessionId();
  return id ? readAppSessionById(id) : null;
}

/**
 * Ends this browser's session and clears its cookie. Only in a Server Action
 * or Route Handler. With `revokeIfLast`, the account's OAuth tokens are
 * revoked once no other browser is signed in to it.
 */
export async function endAppSession({ revokeIfLast }: { revokeIfLast: boolean }): Promise<void> {
  const id = await currentSessionId();
  // Same flags as when set: a __Host- cookie is only replaced by a Secure one.
  (await cookies()).set(cookie().name, "", { ...cookie().options, maxAge: 0 });
  if (!id) return;
  const session = await readAppSessionById(id);
  await store((r) => r.del(sessionKey(id)));
  if (!session) return;

  const account = accountKey(session.did);
  await store((r) => r.sRem(account, id));
  if (!revokeIfLast) return;
  // Sessions that expired on their own are still listed; drop them first.
  const others = await store((r) => r.sMembers(account));
  for (const other of others) {
    if (!(await store((r) => r.exists(sessionKey(other))))) {
      await store((r) => r.sRem(account, other));
    }
  }
  if ((await store((r) => r.sCard(account))) > 0) return;
  try {
    await (await getOAuthClient()).revoke(session.did);
  } catch (err) {
    // The tokens are deleted locally either way; the server-side revocation
    // is best effort.
    logError("[auth] revoke failed", err, { did: session.did });
  }
}
