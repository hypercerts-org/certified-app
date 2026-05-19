import { writeToRepo } from "@/lib/atproto/repo-write"
import { ORG_MARKER_COLLECTION } from "@/lib/groups/constants"
import type { GroupMetadata } from "@/lib/groups/types"

/**
 * Write the `app.certified.actor.organization` marker record for a DID.
 *
 * Two write paths via `writeToRepo`:
 *   - When `targetDid === ownDid`, the user editing their own
 *     PDS record — goes through the XRPC proxy with
 *     `com.atproto.repo.putRecord` (rkey "self").
 *   - When `targetDid !== ownDid`, a group admin editing the
 *     group's marker — routes through the group BFF at
 *     `PUT /api/groups/[did]/metadata`. The BFF's allowlist
 *     (METADATA_FIELDS) controls which fields land on the record;
 *     the BFF adds `$type` server-side, while the XRPC path adds
 *     it inline here.
 *
 * Empty-string fields are NOT stripped here — the caller is responsible
 * for converting empty inputs to `undefined` before constructing the
 * record. That keeps "clear this field" as an explicit `undefined`
 * write (which `pickAllowedFields` drops) rather than silently turning
 * `""` into a stored empty string.
 */
export async function putOrgMarker(
  ownDid: string,
  targetDid: string,
  metadata: GroupMetadata,
  opts?: { swapRecord?: string },
): Promise<void> {
  const swap = opts?.swapRecord
  await writeToRepo<unknown>({
    ownDid,
    targetDid,
    ownPath: {
      url: "/api/xrpc/com/atproto/repo/putRecord",
      method: "POST",
      body: {
        repo: ownDid,
        collection: ORG_MARKER_COLLECTION,
        rkey: "self",
        record: {
          ...metadata,
          $type: ORG_MARKER_COLLECTION,
        },
        ...(swap ? { swapRecord: swap } : {}),
      },
    },
    groupPath: {
      url: `/api/groups/${encodeURIComponent(targetDid)}/metadata`,
      method: "PUT",
      // metadata route allowlists known fields; swapRecord sits at
      // the top level alongside them — same pattern as the profile
      // route. The route reads it before pickAllowedFields strips it.
      body: swap ? { ...metadata, swapRecord: swap } : metadata,
    },
    errorFallback: "Failed to update organization details",
  })
}
