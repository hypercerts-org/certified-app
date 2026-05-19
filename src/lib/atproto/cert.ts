import { writeToRepo } from "@/lib/atproto/repo-write"
import type { ClaimActivity } from "@/lib/atproto/activity-types"

const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"

/**
 * Write a cert record (in place, by rkey). Dual-path via writeToRepo:
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
  opts?: { swapRecord?: string },
): Promise<{ uri: string; cid: string }> {
  const body = { ...record, $type: ACTIVITY_COLLECTION }
  const swap = opts?.swapRecord
  return writeToRepo<{ uri: string; cid: string }>({
    ownDid,
    targetDid,
    ownPath: {
      url: "/api/xrpc/com/atproto/repo/putRecord",
      method: "POST",
      body: {
        repo: ownDid,
        collection: ACTIVITY_COLLECTION,
        rkey,
        record: body,
        ...(swap ? { swapRecord: swap } : {}),
      },
    },
    groupPath: {
      url: `/api/groups/${encodeURIComponent(targetDid)}/activity`,
      method: "PUT",
      body: { rkey, record: body, ...(swap ? { swapRecord: swap } : {}) },
    },
    errorFallback: "Failed to save cert",
  })
}
