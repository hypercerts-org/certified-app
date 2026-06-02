"use client"

import { writeToRepo } from "@/lib/atproto/repo-write"
import type { CollectionValue } from "@/lib/atproto/collection"

const PROJECT_COLLECTION = "org.hypercerts.collection"

/**
 * Write a project record (in place, by rkey). Dual-path via
 * writeToRepo, mirroring `putCertRecord`:
 *
 *   - When `targetDid === ownDid` (the user editing their own
 *     project), goes through the XRPC proxy's
 *     `com.atproto.repo.putRecord`. The proxy enforces the
 *     `ALLOWED_WRITE_COLLECTIONS` allowlist.
 *   - When they differ (group admin editing a group's project),
 *     goes through the BFF route at `/api/groups/<did>/project`
 *     which validates + writes via the group's service auth.
 *
 * Returns `{ uri, cid }` so the caller can mirror the new commit
 * locally and skip an extra read round-trip.
 *
 * Note: the BFF route performs read-modify-write to server-pin
 * `createdAt`, `type`, and `items` (issue #67 review B1 / B2 / B5).
 * Callers don't need to think about these fields — anything passed
 * for them is ignored on group writes. For own-DID XRPC writes the
 * client is responsible for round-tripping `createdAt` correctly;
 * the inline-edit flow does `{ ...effectiveValue, ...edits }` so
 * the stored value is preserved.
 */
export async function putProjectRecord(
  ownDid: string,
  targetDid: string,
  rkey: string,
  record: CollectionValue,
  opts?: { swapRecord?: string },
): Promise<{ uri: string; cid: string }> {
  const body = { ...record, $type: PROJECT_COLLECTION }
  const swap = opts?.swapRecord
  return writeToRepo<{ uri: string; cid: string }>({
    ownDid,
    targetDid,
    ownPath: {
      url: "/api/xrpc/com/atproto/repo/putRecord",
      method: "POST",
      body: {
        repo: ownDid,
        collection: PROJECT_COLLECTION,
        rkey,
        record: body,
        ...(swap ? { swapRecord: swap } : {}),
      },
    },
    groupPath: {
      url: `/api/groups/${encodeURIComponent(targetDid)}/project`,
      method: "PUT",
      body: { rkey, record: body, ...(swap ? { swapRecord: swap } : {}) },
    },
    errorFallback: "Failed to save project",
  })
}
