import { authFetch } from "@/lib/auth/fetch"

/**
 * App-password management via the elevated-session routes under
 * `/api/account/app-passwords/*` (issue #223).
 *
 * certified-app is OAuth-only, but atproto's `com.atproto.server.*`
 * app-password endpoints reject OAuth credentials (403). So instead of the
 * XRPC proxy these calls go through our own routes, which run the ops inside
 * a short-lived password session the user unlocks once (with their account
 * password + emailed code if 2FA is on).
 *
 * Flow:
 *   1. `unlockAppPasswords(password, authFactorToken?)` opens the session.
 *      Returns a discriminated result so the UI can branch to the 2FA step
 *      or an invalid-password message.
 *   2. `list` / `create` / `revoke` operate inside that session. Each throws
 *      `AppPasswordsLockedError` when the session is gone (TTL expiry), so
 *      the UI can drop back to the locked gate.
 *
 * `createAppPassword` returns the generated secret EXACTLY ONCE — the PDS
 * never reveals it again — so the caller must surface it for copy
 * immediately and then drop it.
 */

export interface AppPasswordInfo {
  name: string
  createdAt: string
}

export interface CreatedAppPassword {
  name: string
  password: string
  createdAt: string
}

export type UnlockResult =
  | { status: "ok" }
  | { status: "twoFactorRequired" }
  | { status: "invalidCode" }
  | { status: "invalid" }

/**
 * Thrown by list/create/revoke when the route reports `401 { error: "locked" }`
 * — i.e. there's no elevated session (it was never opened, or the ~10-minute
 * TTL lapsed). The UI catches this to re-show the unlock step.
 */
export class AppPasswordsLockedError extends Error {
  constructor() {
    super("App-password session is locked")
    this.name = "AppPasswordsLockedError"
  }
}

const BASE = "/api/account/app-passwords"

async function isLocked(res: Response): Promise<boolean> {
  if (res.status !== 401) return false
  try {
    const data = (await res.clone().json()) as { error?: string }
    return data.error === "locked"
  } catch {
    return false
  }
}

/**
 * Open the elevated session. The PDS makes "wrong password" and "no password
 * set" indistinguishable, so both map to `invalid`; `twoFactorRequired` means
 * the PDS emailed a code and the caller should re-submit with `authFactorToken`.
 */
export async function unlockAppPasswords(
  password: string,
  authFactorToken?: string,
): Promise<UnlockResult> {
  const res = await authFetch(`${BASE}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      password,
      ...(authFactorToken ? { authFactorToken } : {}),
    }),
  })
  if (!res.ok) {
    throw new Error("Couldn't reach the unlock service. Please try again.")
  }
  const data = (await res.json()) as Partial<UnlockResult>
  if (
    data.status === "ok" ||
    data.status === "twoFactorRequired" ||
    data.status === "invalidCode" ||
    data.status === "invalid"
  ) {
    return { status: data.status }
  }
  throw new Error("Unexpected response from the unlock service.")
}

export async function listAppPasswords(
  signal?: AbortSignal,
): Promise<AppPasswordInfo[]> {
  const res = await authFetch(BASE, { signal })
  if (await isLocked(res)) throw new AppPasswordsLockedError()
  if (!res.ok) throw new Error("Failed to load app passwords")
  const data = (await res.json()) as { passwords?: AppPasswordInfo[] }
  return data.passwords ?? []
}

export async function createAppPassword(
  name: string,
): Promise<CreatedAppPassword> {
  const res = await authFetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (await isLocked(res)) throw new AppPasswordsLockedError()
  if (!res.ok) {
    let message = "Failed to create app password"
    try {
      const data = (await res.json()) as { error?: string; message?: string }
      if (typeof data.message === "string") message = data.message
      else if (typeof data.error === "string") message = data.error
    } catch {
      // keep the default message
    }
    throw new Error(message)
  }
  return (await res.json()) as CreatedAppPassword
}

export async function revokeAppPassword(name: string): Promise<void> {
  const res = await authFetch(`${BASE}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (await isLocked(res)) throw new AppPasswordsLockedError()
  if (!res.ok) throw new Error("Failed to revoke app password")
}
