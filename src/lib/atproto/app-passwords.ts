import { authFetch } from "@/lib/auth/fetch"

/**
 * App-password management via the XRPC proxy (`com.atproto.server.*`).
 *
 * App passwords let the account authenticate to third-party clients (and
 * the Certified Group Service's `import` flow) without handing over the
 * main password. `createAppPassword` returns the generated secret EXACTLY
 * ONCE — the PDS never reveals it again — so the caller must surface it for
 * copy immediately and then drop it.
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

export async function listAppPasswords(
  signal?: AbortSignal,
): Promise<AppPasswordInfo[]> {
  const res = await authFetch(
    "/api/xrpc/com/atproto/server/listAppPasswords",
    { signal },
  )
  if (!res.ok) throw new Error("Failed to load app passwords")
  const data = (await res.json()) as { passwords?: AppPasswordInfo[] }
  return data.passwords ?? []
}

export async function createAppPassword(
  name: string,
): Promise<CreatedAppPassword> {
  const res = await authFetch(
    "/api/xrpc/com/atproto/server/createAppPassword",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  )
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
  const res = await authFetch(
    "/api/xrpc/com/atproto/server/revokeAppPassword",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  )
  if (!res.ok) throw new Error("Failed to revoke app password")
}
