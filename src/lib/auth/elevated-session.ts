import "server-only";

// Short-lived elevated password sessions in Valkey, plus safe PDS calls for
// AT Protocol account operations that OAuth tokens cannot perform (app
// passwords, email changes, password resets, and group-account handle/email
// management).
//
// Security invariants:
// - Passwords and PDS JWTs never leave the server and are never logged.
// - Elevated sessions live in Valkey for 10 minutes (ELEVATED_TTL_SECONDS) and
//   are explicitly revoked via `com.atproto.server.deleteSession` on lock.
// - Password verification rate limits fail CLOSED (per caller DID and per
//   target DID) so guessing is bounded even across multiple caller accounts.
// - `createSession` verifies the PDS returned the exact target DID before
//   persisting the session.

import type { OAuthSession } from "@atproto/oauth-client-node";
import { getPdsUrl, safeFetch } from "@/lib/identity";
import { logError } from "@/lib/log";
import { jsonStore } from "./stores";
import { store, storeKey } from "./valkey";

const ELEVATED_TTL_SECONDS = 10 * 60;
const PDS_TIMEOUT_MS = 10_000;

export type ElevatedScope =
  | { kind: "personal"; callerDid: string }
  | { kind: "group"; callerDid: string; groupDid: string };

type StoredElevatedSession = {
  accessJwt: string;
  refreshJwt: string;
  pdsUrl: string;
};

export type EstablishResult =
  | { status: "ok" }
  | { status: "twoFactorRequired" }
  | { status: "invalidCode" }
  | { status: "invalid" }
  | { status: "rateLimited" }
  | { status: "unavailable" };

export type ElevatedPdsResult = { kind: "locked" } | { kind: "ok"; response: Response };

const elevatedStore = jsonStore<StoredElevatedSession>("elevated:", ELEVATED_TTL_SECONDS);

function scopeKey(scope: ElevatedScope): string {
  return scope.kind === "personal"
    ? `personal:${scope.callerDid}`
    : `group:${scope.callerDid}:${scope.groupDid}`;
}

function targetDidOf(scope: ElevatedScope): string {
  return scope.kind === "personal" ? scope.callerDid : scope.groupDid;
}

function readErrorCode(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const code = (body as { error?: unknown }).error;
    if (typeof code === "string") return code;
  }
  return undefined;
}

export async function readPdsError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof data.message === "string" && data.message.trim()) return data.message;
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // Non-JSON upstream error: keep the fallback.
  }
  return fallback;
}

async function pdsFetch(url: string, init: RequestInit): Promise<Response> {
  return safeFetch(url, {
    ...init,
    signal: AbortSignal.any([
      AbortSignal.timeout(PDS_TIMEOUT_MS),
      ...(init.signal ? [init.signal] : []),
    ]),
  });
}

// Fail-closed fixed-window rate limit for password unlock attempts:
// 10 per 10 minutes per caller DID, and 20 per 10 minutes per target DID.
async function checkUnlockRateLimit(
  callerDid: string,
  targetDid: string,
): Promise<"allowed" | "limited" | "unavailable"> {
  const window = Math.floor(Date.now() / 600_000);
  const callerKey = storeKey(`ratelimit:unlock:caller:${callerDid}:${window}`);
  const targetKey = storeKey(`ratelimit:unlock:target:${targetDid}:${window}`);
  try {
    const [callerCount, targetCount] = await store(async (r) => {
      const [c] = await r.multi().incr(callerKey).expire(callerKey, 600).exec();
      const [t] = await r.multi().incr(targetKey).expire(targetKey, 600).exec();
      return [Number(c), Number(t)] as const;
    });
    if (callerCount > 10 || targetCount > 20) return "limited";
    return "allowed";
  } catch (err) {
    logError("[elevated-session] rate limit check failed", err);
    return "unavailable";
  }
}

/**
 * Opens a short-lived password session against `scope`'s target PDS and stores
 * the tokens in Valkey. Returns a discriminated outcome without leaking tokens.
 */
export async function establishElevatedSession(
  scope: ElevatedScope,
  password: string,
  authFactorToken?: string,
): Promise<EstablishResult> {
  const targetDid = targetDidOf(scope);
  const rate = await checkUnlockRateLimit(scope.callerDid, targetDid);
  if (rate === "limited") return { status: "rateLimited" };
  if (rate === "unavailable") return { status: "unavailable" };

  let pdsUrl: string;
  try {
    pdsUrl = await getPdsUrl(targetDid);
  } catch (err) {
    logError("[elevated-session] PDS lookup failed", err, { targetDid });
    return { status: "unavailable" };
  }

  let res: Response;
  try {
    res = await pdsFetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: targetDid,
        password,
        ...(authFactorToken ? { authFactorToken } : {}),
      }),
    });
  } catch (err) {
    logError("[elevated-session] createSession request failed", err, { targetDid });
    return { status: "unavailable" };
  }

  if (res.ok) {
    const data = (await res.json().catch(() => null)) as {
      did?: unknown;
      accessJwt?: unknown;
      refreshJwt?: unknown;
    } | null;
    if (
      !data ||
      data.did !== targetDid ||
      typeof data.accessJwt !== "string" ||
      typeof data.refreshJwt !== "string"
    ) {
      logError("[elevated-session] unexpected createSession response", null, { targetDid });
      return { status: "unavailable" };
    }
    await elevatedStore.set(scopeKey(scope), {
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
      pdsUrl,
    });
    return { status: "ok" };
  }

  const body = await res.json().catch(() => null);
  const code = readErrorCode(body);
  if (code === "AuthFactorTokenRequired") return { status: "twoFactorRequired" };
  if (code === "InvalidToken" || code === "ExpiredToken") return { status: "invalidCode" };
  if (res.status === 401) return { status: "invalid" };
  if (res.status === 429) return { status: "rateLimited" };
  logError("[elevated-session] createSession rejected", null, {
    targetDid,
    status: res.status,
    code,
  });
  return { status: "unavailable" };
}

/** Whether an elevated session is currently open in Valkey for `scope`. */
export async function hasElevatedSession(scope: ElevatedScope): Promise<boolean> {
  try {
    return (await elevatedStore.get(scopeKey(scope))) !== undefined;
  } catch (err) {
    logError("[elevated-session] status check failed", err);
    return false;
  }
}

async function deleteRemoteSession(session: StoredElevatedSession): Promise<void> {
  try {
    await pdsFetch(`${session.pdsUrl}/xrpc/com.atproto.server.deleteSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.refreshJwt}` },
    });
  } catch (err) {
    logError("[elevated-session] remote deleteSession failed", err);
  }
}

/** Revokes the remote PDS session (best-effort) and removes it from Valkey. */
export async function endElevatedSession(scope: ElevatedScope): Promise<void> {
  const key = scopeKey(scope);
  const existing = await elevatedStore.get(key).catch(() => undefined);
  await elevatedStore.del(key).catch((err) => logError("[elevated-session] delete failed", err));
  if (existing) await deleteRemoteSession(existing);
}

async function refreshStoredSession(
  key: string,
  session: StoredElevatedSession,
): Promise<StoredElevatedSession | null> {
  try {
    const res = await pdsFetch(`${session.pdsUrl}/xrpc/com.atproto.server.refreshSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.refreshJwt}` },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      accessJwt?: unknown;
      refreshJwt?: unknown;
    } | null;
    if (!data || typeof data.accessJwt !== "string" || typeof data.refreshJwt !== "string") {
      return null;
    }
    const next: StoredElevatedSession = {
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
      pdsUrl: session.pdsUrl,
    };
    await elevatedStore.set(key, next);
    return next;
  } catch {
    return null;
  }
}

/**
 * Calls an XRPC endpoint on `scope`'s PDS with the stored elevated Bearer JWT.
 * Refreshes once on `ExpiredToken`; returns `{ kind: "locked" }` if no session
 * is open or the session has lapsed.
 */
export async function callElevatedPds(
  scope: ElevatedScope,
  nsid: string,
  options?: { method?: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<ElevatedPdsResult> {
  const key = scopeKey(scope);
  let session = await elevatedStore.get(key);
  if (!session) return { kind: "locked" };

  const method = options?.method ?? "GET";
  const run = (accessJwt: string, pdsUrl: string) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${accessJwt}` };
    let serialized: string | undefined;
    // Omit Content-Type and body when no body is provided: ATProto endpoints
    // like requestEmailUpdate reject even `{}`.
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      serialized = JSON.stringify(options.body);
    }
    return pdsFetch(`${pdsUrl}/xrpc/${nsid}`, { method, headers, body: serialized });
  };

  let response = await run(session.accessJwt, session.pdsUrl);
  if (response.status === 401) {
    const refreshed = await refreshStoredSession(key, session);
    if (!refreshed) {
      await elevatedStore.del(key).catch(() => {});
      return { kind: "locked" };
    }
    session = refreshed;
    response = await run(session.accessJwt, session.pdsUrl);
    if (response.status === 401) {
      await elevatedStore.del(key).catch(() => {});
      return { kind: "locked" };
    }
  }
  return { kind: "ok", response };
}

/** Calls an OAuth-authorized XRPC endpoint on the signed-in user's PDS. */
export async function callOAuthPds(
  session: OAuthSession,
  nsid: string,
  options?: { method?: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<Response> {
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  return session.fetchHandler(`/xrpc/${nsid}`, { method, headers, body });
}

/** Calls an unauthenticated XRPC POST endpoint on `did`'s PDS (password reset). */
export async function callPublicPds(
  did: string,
  nsid: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const pdsUrl = await getPdsUrl(did);
  return pdsFetch(`${pdsUrl}/xrpc/${nsid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Verifies that a password reset actually applied to `groupDid` (since
 * `resetPassword` targets whichever account owns the emailed reset code).
 * Immediately tears down the probe session on success.
 */
export async function verifyGroupPassword(groupDid: string, password: string): Promise<boolean> {
  const pdsUrl = await getPdsUrl(groupDid);
  const res = await pdsFetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: groupDid, password }),
  });
  if (res.ok) {
    const data = (await res.json().catch(() => null)) as { refreshJwt?: unknown } | null;
    if (typeof data?.refreshJwt === "string") {
      await deleteRemoteSession({ accessJwt: "", refreshJwt: data.refreshJwt, pdsUrl });
    }
    return true;
  }
  const body = await res.json().catch(() => null);
  return readErrorCode(body) === "AuthFactorTokenRequired";
}
