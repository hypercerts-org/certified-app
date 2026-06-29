import { authFetch } from "@/lib/auth/fetch"

/**
 * Change the signed-in user's own email via the elevated-session route at
 * `/api/account/email`.
 *
 * Like app-password management, atproto's email endpoints reject OAuth
 * credentials, so these run inside the SAME short-lived password session the
 * user unlocks once (see `@/lib/atproto/app-passwords`). Unlocking for app
 * passwords also unlocks email and vice-versa.
 *
 * Flow:
 *   1. `readEmail()` returns the current address (or throws `EmailLockedError`
 *      when no session is open, so the UI shows the unlock gate).
 *   2. `requestEmailUpdate()` asks the PDS to start a change. If the current
 *      email is confirmed the PDS emails a code and returns `tokenRequired`.
 *   3. `updateEmail(email, token?)` commits the new address (with the code when
 *      one was required).
 *
 * Each call throws `EmailLockedError` when the route reports
 * `401 { error: "locked" }`, so the UI can drop back to the unlock step.
 */

export interface EmailInfo {
  email: string | null
  emailConfirmed: boolean
}

/**
 * Thrown when the route reports `401 { error: "locked" }` — there's no elevated
 * session (never opened, or the ~10-minute TTL lapsed). The UI catches this to
 * re-show the unlock step.
 */
export class EmailLockedError extends Error {
  constructor() {
    super("Account email session is locked")
    this.name = "EmailLockedError"
  }
}

const BASE = "/api/account/email"

async function isLocked(res: Response): Promise<boolean> {
  if (res.status !== 401) return false
  try {
    const data = (await res.clone().json()) as { error?: string }
    return data.error === "locked"
  } catch {
    return false
  }
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string }
    return data.message || data.error || fallback
  } catch {
    return fallback
  }
}

export async function readEmail(signal?: AbortSignal): Promise<EmailInfo> {
  const res = await authFetch(BASE, { signal })
  if (await isLocked(res)) throw new EmailLockedError()
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to read email"))
  const data = (await res.json()) as Partial<EmailInfo>
  return {
    email: data.email ?? null,
    emailConfirmed: !!data.emailConfirmed,
  }
}

/**
 * Ask the PDS to start an email change. Returns whether a code was emailed to
 * the current address (`tokenRequired`); pass that code to `updateEmail`.
 */
export async function requestEmailUpdate(): Promise<{ tokenRequired: boolean }> {
  const res = await authFetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  if (await isLocked(res)) throw new EmailLockedError()
  if (!res.ok)
    throw new Error(await errorMessage(res, "Failed to request email update"))
  const data = (await res.json()) as { tokenRequired?: boolean }
  return { tokenRequired: !!data.tokenRequired }
}

export async function updateEmail(
  email: string,
  token?: string,
): Promise<void> {
  const res = await authFetch(BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, ...(token ? { token } : {}) }),
  })
  if (await isLocked(res)) throw new EmailLockedError()
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to update email"))
}
