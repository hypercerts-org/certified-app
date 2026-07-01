import { resolvePdsUrl } from "@/lib/atproto/did"
import { logSafe } from "@/lib/utils/log-safe"
import { getRedis } from "./stores"

/**
 * Transient **elevated password session** for app-password management.
 *
 * certified-app is OAuth-only, but atproto's app-password endpoints
 * (`com.atproto.server.listAppPasswords` / `createAppPassword` /
 * `revokeAppPassword`) categorically reject OAuth credentials (403). They
 * require a full password-based `createSession`. This module lets a
 * passwordless / OAuth user unlock a SHORT-LIVED password session once
 * (with their account password + emailed code if email-2FA is on), then
 * runs the app-password operations server-side through it.
 *
 * Storage: `{ accessJwt, refreshJwt, pdsUrl }` in Redis under
 * `apppw:elev:{did}` with a ~10-minute TTL. Tokens NEVER reach the
 * browser. Lock — or TTL expiry — calls `deleteSession` and clears Redis.
 *
 * Auth model: password sessions use **Bearer JWT (no DPoP)** — DPoP is
 * OAuth-only — so every call here is a plain `fetch` with
 * `Authorization: Bearer <jwt>`, much simpler than the OAuth/DPoP proxy.
 *
 * Security invariants (see docs/app-passwords-elevated-session/plan.md):
 *   - never log password / tokens (we never hand them to a logger;
 *     `logSafe` redacts JWTs as a backstop);
 *   - short TTL; `deleteSession` on lock; DID-scoped (callers only ever
 *     act on their own account — the DID is the caller's session DID);
 *   - Redis-only token storage, never serialized to the client.
 */

const ELEVATED_PREFIX = "apppw:elev:"
/** ~10 minutes. Long enough to list + create + revoke without re-prompting,
 *  short enough that a full-privilege password session isn't left lying
 *  around server-side. */
const ELEVATED_TTL_SECONDS = 600

interface ElevatedSession {
  accessJwt: string
  refreshJwt: string
  pdsUrl: string
}

/** Discriminated outcome of an unlock attempt. Mirrors the branches
 *  `createSession` produces for our purposes; anything unexpected throws so
 *  the route surfaces a real error status. */
export type EstablishResult =
  | { status: "ok" }
  | { status: "twoFactorRequired" }
  | { status: "invalidCode" }
  | { status: "invalid" }

/** Read the atproto XRPC error discriminator from a response body. */
function readErrorCode(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const e = body as { error?: unknown }
    if (typeof e.error === "string") return e.error
  }
  return undefined
}

/**
 * Unlock: resolve the caller's PDS, run `createSession`, and on success
 * stash the resulting session in Redis. The DID is always the caller's own
 * session DID, so this can only ever open a session for the caller's account.
 *
 *   - success                 → store + `{ status: "ok" }`
 *   - `AuthFactorTokenRequired`→ `{ status: "twoFactorRequired" }` (the PDS
 *     emails the code automatically; the client re-submits with it)
 *   - `InvalidToken`/`ExpiredToken` (a wrong/expired emailed 2FA code — the
 *     PDS returns these as a 400, NOT a 401) → `{ status: "invalidCode" }`
 *   - any other 401 (wrong password OR no password set — the PDS makes them
 *     indistinguishable) → `{ status: "invalid" }`
 *   - anything else (5xx, rate-limit, malformed) → throws, carrying the
 *     upstream status so the route maps it sensibly.
 */
export async function establish(
  did: string,
  password: string,
  authFactorToken?: string,
): Promise<EstablishResult> {
  const pdsUrl = await resolvePdsUrl(did)
  if (!pdsUrl) {
    throw Object.assign(new Error("Could not resolve account PDS"), {
      status: 502,
    })
  }

  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: did,
      password,
      ...(authFactorToken ? { authFactorToken } : {}),
    }),
  })

  if (res.ok) {
    const data = (await res.json()) as {
      did?: string
      accessJwt?: string
      refreshJwt?: string
    }
    // Defence-in-depth: the session we store must be for the caller's own
    // account. identifier===did already guarantees this, but verify the
    // PDS agreed before persisting a full-privilege session.
    if (
      typeof data.accessJwt !== "string" ||
      typeof data.refreshJwt !== "string" ||
      data.did !== did
    ) {
      throw Object.assign(new Error("Unexpected createSession response"), {
        status: 502,
      })
    }
    await storeElevated(did, {
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
      pdsUrl,
    })
    return { status: "ok" }
  }

  const body = await res.json().catch(() => undefined)
  const code = readErrorCode(body)
  if (code === "AuthFactorTokenRequired") return { status: "twoFactorRequired" }
  // A wrong/expired emailed 2FA code: the password was accepted but the
  // auth-factor token wasn't. atproto surfaces this as a 400 InvalidToken /
  // ExpiredToken (not a 401), so it must be checked before the 401 branch.
  if (code === "InvalidToken" || code === "ExpiredToken") {
    return { status: "invalidCode" }
  }
  // Every other 401 is an authentication failure we present uniformly
  // (wrong password / no password set / takedown). Don't echo the PDS
  // message — the route copy covers the ambiguity.
  if (res.status === 401) return { status: "invalid" }

  // 4xx (other than 401) / 429 / 5xx — an upstream problem, not a user
  // credential result. Surface the status so the route doesn't masquerade
  // it as "invalid password".
  throw Object.assign(new Error(`createSession failed (${res.status})`), {
    status: res.status,
  })
}

async function storeElevated(
  did: string,
  session: ElevatedSession,
): Promise<void> {
  await getRedis().set(`${ELEVATED_PREFIX}${did}`, JSON.stringify(session), {
    ex: ELEVATED_TTL_SECONDS,
  })
}

/** Return the caller's stored elevated session, or null if none / expired. */
export async function getElevated(did: string): Promise<ElevatedSession | null> {
  const data = await getRedis().get<string>(`${ELEVATED_PREFIX}${did}`)
  if (!data) return null
  // Upstash's REST client may return the value already-parsed; mirror
  // stores.ts and only JSON.parse when it's still a string.
  const parsed = typeof data === "string" ? safeParse(data) : data
  if (
    parsed &&
    typeof parsed === "object" &&
    typeof (parsed as ElevatedSession).accessJwt === "string" &&
    typeof (parsed as ElevatedSession).refreshJwt === "string" &&
    typeof (parsed as ElevatedSession).pdsUrl === "string"
  ) {
    return parsed as ElevatedSession
  }
  return null
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * Lock: best-effort `deleteSession` on the PDS (authed with the REFRESH
 * token — deleteSession is the one op that auths with refresh, not access),
 * then drop the Redis key. Always clears Redis even if the network call
 * fails, so a stuck PDS can't leave the session un-lockable client-side.
 */
export async function end(did: string): Promise<void> {
  const session = await getElevated(did)
  if (session) {
    try {
      await fetch(`${session.pdsUrl}/xrpc/com.atproto.server.deleteSession`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.refreshJwt}` },
      })
    } catch (err) {
      // Best-effort — the Redis del below is what actually locks us out.
      logSafe("[app-password-session] deleteSession failed", err)
    }
  }
  await getRedis().del(`${ELEVATED_PREFIX}${did}`)
}

/** Outcome of a proxied app-password operation. */
export type ElevatedCallResult =
  | { kind: "locked" }
  | { kind: "ok"; response: Response }

/**
 * Run an app-password XRPC op through the caller's stored elevated session.
 * Loads the session, attaches the Bearer access token, and fetches
 * `{pdsUrl}/xrpc/{nsid}`. If there is no session — or the PDS rejects the
 * stored token (401, e.g. the ~10-min TTL lapsed on the PDS side or the
 * session was revoked) — returns `{ kind: "locked" }` and clears the dead
 * session so the next unlock starts clean. The caller reads `response`.
 */
export async function callPds(
  did: string,
  nsid: string,
  init?: { method?: string; body?: unknown },
): Promise<ElevatedCallResult> {
  const session = await getElevated(did)
  if (!session) return { kind: "locked" }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessJwt}`,
  }
  if (init?.body !== undefined) headers["Content-Type"] = "application/json"

  const response = await fetch(`${session.pdsUrl}/xrpc/${nsid}`, {
    method: init?.method ?? "GET",
    headers,
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })

  if (response.status === 401) {
    // Stored token is dead — clear it and tell the caller to re-unlock.
    await end(did)
    return { kind: "locked" }
  }

  return { kind: "ok", response }
}
