import { authFetch } from "@/lib/auth/fetch"
import { toUserErrorMessage } from "@/lib/utils/api"

/** Collections the /records page can delete from the signed-in account. */
export const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"
export const PROJECT_COLLECTION = "org.hypercerts.collection"

/**
 * Delete one record from the signed-in person's own repo through the XRPC
 * proxy (which only accepts writes where `repo` is the session DID). Throws
 * an Error with a user-facing message on failure.
 *
 * Personal account only: group-owned records go through the group BFF
 * endpoints instead (see the activity and project detail pages).
 */
export async function deleteOwnRecord(
  repo: string,
  collection: string,
  rkey: string,
  fallbackMessage: string,
): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, collection, rkey }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      toUserErrorMessage(res.status, (data as { error?: string }).error, fallbackMessage),
    )
  }
}
