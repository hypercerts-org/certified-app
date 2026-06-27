import { resolvePdsUrl } from "@/lib/atproto/did"
import { logSafe } from "@/lib/utils/log-safe"
import { getRedis } from "./stores"

/**
 * Transient **elevated session for a GROUP account**, unlocked by an
 * owner/admin who knows the group's password.
 *
 * The CGS service-auth path only proxies the group's repo + identity, never
 * account-level operations — so the app can't read or change a group's email.
 * But anyone who knows the group's password can open a real session as the
 * group (`createSession` with the group DID), and that session can `getSession`
 * (read the email) and `updateEmail` (change it). This module runs that
 * unlock once (group password + emailed 2FA code if on), stores the resulting
 * session server-side, and proxies the account operations through it.
 *
 * Mirrors `app-password-session.ts`, but the session is for the GROUP account
 * (identifier = groupDid) and is keyed by BOTH the caller and the group, so one
 * owner's unlock is never reachable by another caller. Tokens never reach the
 * browser; lock — or TTL expiry — calls `deleteSession` and clears Redis.
 */

const PREFIX = "groupacct:elev:"
const TTL_SECONDS = 600

function key(callerDid: string, groupDid: string): string {
  return `${PREFIX}${callerDid}:${groupDid}`
}

interface ElevatedSession {
  accessJwt: string
  refreshJwt: string
  pdsUrl: string
}

export type EstablishResult =
  | { status: "ok" }
  | { status: "twoFactorRequired" }
  | { status: "invalidCode" }
  | { status: "invalid" }

function readErrorCode(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const e = body as { error?: unknown }
    if (typeof e.error === "string") return e.error
  }
  return undefined
}

/**
 * Unlock: resolve the GROUP's PDS, `createSession` as the group DID with the
 * supplied password, and on success stash the session in Redis under
 * `{callerDid}:{groupDid}`.
 *
 *   - success                  → store + `{ status: "ok" }`
 *   - `AuthFactorTokenRequired`→ `{ status: "twoFactorRequired" }` (the PDS
 *     emails a code to the GROUP's address; resubmit with it)
 *   - `InvalidToken`/`ExpiredToken` → `{ status: "invalidCode" }`
 *   - other 401 (wrong group password) → `{ status: "invalid" }`
 *   - anything else → throws, carrying the upstream status.
 */
export async function establish(
  callerDid: string,
  groupDid: string,
  password: string,
  authFactorToken?: string,
): Promise<EstablishResult> {
  const pdsUrl = await resolvePdsUrl(groupDid)
  if (!pdsUrl) {
    throw Object.assign(new Error("Could not resolve the group's PDS"), {
      status: 502,
    })
  }

  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: groupDid,
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
    // Defence-in-depth: the session must be for the GROUP account.
    if (
      typeof data.accessJwt !== "string" ||
      typeof data.refreshJwt !== "string" ||
      data.did !== groupDid
    ) {
      throw Object.assign(new Error("Unexpected createSession response"), {
        status: 502,
      })
    }
    await getRedis().set(
      key(callerDid, groupDid),
      JSON.stringify({
        accessJwt: data.accessJwt,
        refreshJwt: data.refreshJwt,
        pdsUrl,
      } satisfies ElevatedSession),
      { ex: TTL_SECONDS },
    )
    return { status: "ok" }
  }

  const body = await res.json().catch(() => undefined)
  const code = readErrorCode(body)
  if (code === "AuthFactorTokenRequired") return { status: "twoFactorRequired" }
  if (code === "InvalidToken" || code === "ExpiredToken") {
    return { status: "invalidCode" }
  }
  if (res.status === 401) return { status: "invalid" }

  throw Object.assign(new Error(`createSession failed (${res.status})`), {
    status: res.status,
  })
}

export async function getElevated(
  callerDid: string,
  groupDid: string,
): Promise<ElevatedSession | null> {
  const data = await getRedis().get<string>(key(callerDid, groupDid))
  if (!data) return null
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

/** Lock: best-effort `deleteSession` (refresh-token auth), then drop Redis. */
export async function end(callerDid: string, groupDid: string): Promise<void> {
  const session = await getElevated(callerDid, groupDid)
  if (session) {
    try {
      await fetch(`${session.pdsUrl}/xrpc/com.atproto.server.deleteSession`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.refreshJwt}` },
      })
    } catch (err) {
      logSafe("[group-account-session] deleteSession failed", err)
    }
  }
  await getRedis().del(key(callerDid, groupDid))
}

export type ElevatedCallResult =
  | { kind: "locked" }
  | { kind: "ok"; response: Response }

/**
 * Run an account XRPC op through the stored group session (Bearer access
 * token). Returns `{ kind: "locked" }` (and clears the dead session) when there
 * is no session or the PDS rejects the stored token (401).
 */
export async function callPds(
  callerDid: string,
  groupDid: string,
  nsid: string,
  init?: { method?: string; body?: unknown },
): Promise<ElevatedCallResult> {
  const session = await getElevated(callerDid, groupDid)
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
    await end(callerDid, groupDid)
    return { kind: "locked" }
  }

  return { kind: "ok", response }
}
