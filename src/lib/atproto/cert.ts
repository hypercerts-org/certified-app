import { authFetch } from "@/lib/auth/fetch"
import { extractError } from "@/lib/utils/api"
import type { ClaimActivity } from "@/lib/atproto/activity-types"

const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"

/**
 * Write a cert record (in place, by rkey). Two paths:
 *
 *   - When `targetDid === ownDid` (the user editing their own cert),
 *     goes through the XRPC proxy's `com.atproto.repo.putRecord`.
 *   - When they differ (group admin editing the group's cert), goes
 *     through the BFF route at `/api/groups/<did>/activity` which
 *     proxies via the user's atproto session to the group's service
 *     auth.
 *
 * Returns `{ uri, cid }` so the caller can mirror the new commit
 * locally and skip an extra read round-trip.
 */
export async function putCertRecord(
  ownDid: string,
  targetDid: string,
  rkey: string,
  record: ClaimActivity,
): Promise<{ uri: string; cid: string }> {
  const body = { ...record, $type: ACTIVITY_COLLECTION }

  if (targetDid !== ownDid) {
    const res = await authFetch(
      `/api/groups/${encodeURIComponent(targetDid)}/activity`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rkey, record: body }),
      },
    )
    if (!res.ok) {
      throw new Error(await extractError(res, "Failed to save cert"))
    }
    return (await res.json()) as { uri: string; cid: string }
  }

  const res = await authFetch("/api/xrpc/com/atproto/repo/putRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: ACTIVITY_COLLECTION,
      rkey,
      record: body,
    }),
  })
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to save cert"))
  }
  return (await res.json()) as { uri: string; cid: string }
}
