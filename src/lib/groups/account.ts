import { authFetch } from "@/lib/auth/fetch"
import { extractError } from "@/lib/utils/api"

/**
 * Client for the elevated GROUP-account session (owner/admin who knows the
 * group's password) — unlock once, then read/change the group's email. Mirrors
 * the app-password client; `/api/groups/*` 401s never log the user out, so a
 * `LOCKED` result just means "re-unlock". The session is short-lived (~10 min,
 * cleared on lock) — not persistent.
 */

const base = (groupDid: string) =>
  `/api/groups/${encodeURIComponent(groupDid)}/account`

export const LOCKED = "locked" as const
export type UnlockStatus =
  | "ok"
  | "twoFactorRequired"
  | "invalidCode"
  | "invalid"
export type GroupEmail = { email: string | null; emailConfirmed: boolean }

async function isLocked(res: Response): Promise<boolean> {
  if (res.status !== 401) return false
  try {
    return ((await res.clone().json()) as { error?: string }).error === "locked"
  } catch {
    return false
  }
}

export async function unlockGroupAccount(
  groupDid: string,
  password: string,
  authFactorToken?: string,
): Promise<{ status: UnlockStatus }> {
  const res = await authFetch(`${base(groupDid)}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      password,
      ...(authFactorToken ? { authFactorToken } : {}),
    }),
  })
  if (!res.ok) throw new Error(await extractError(res, "Unlock failed"))
  return res.json()
}

export async function lockGroupAccount(groupDid: string): Promise<void> {
  await authFetch(`${base(groupDid)}/session`, { method: "DELETE" })
}

export async function getGroupEmail(
  groupDid: string,
): Promise<GroupEmail | typeof LOCKED> {
  const res = await authFetch(`${base(groupDid)}/email`)
  if (await isLocked(res)) return LOCKED
  if (!res.ok) throw new Error(await extractError(res, "Failed to read email"))
  return res.json()
}

export async function requestGroupEmailUpdate(
  groupDid: string,
): Promise<{ tokenRequired: boolean } | typeof LOCKED> {
  const res = await authFetch(`${base(groupDid)}/email`, { method: "POST" })
  if (await isLocked(res)) return LOCKED
  if (!res.ok)
    throw new Error(await extractError(res, "Failed to request email update"))
  return res.json()
}

export async function updateGroupEmail(
  groupDid: string,
  email: string,
  token?: string,
): Promise<typeof LOCKED | void> {
  const res = await authFetch(`${base(groupDid)}/email`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, ...(token ? { token } : {}) }),
  })
  if (await isLocked(res)) return LOCKED
  if (!res.ok) throw new Error(await extractError(res, "Failed to update email"))
}

/** Change the group's handle through the unlocked group session (renames the
 *  group, not the caller — unlike the old proxy route). */
export async function updateGroupHandle(
  groupDid: string,
  handle: string,
): Promise<typeof LOCKED | void> {
  const res = await authFetch(`${base(groupDid)}/handle`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  })
  if (await isLocked(res)) return LOCKED
  if (!res.ok)
    throw new Error(await extractError(res, "Failed to update handle"))
}
