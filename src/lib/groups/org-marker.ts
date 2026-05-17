import { authFetch } from "@/lib/auth/fetch"
import { extractError } from "@/lib/utils/api"
import { ORG_MARKER_COLLECTION } from "@/lib/groups/constants"
import type { GroupMetadata } from "@/lib/groups/types"

/**
 * Write the `app.certified.actor.organization` marker record for a DID.
 *
 * Two write paths:
 *   - When `targetDid === ownDid`, the call is the user editing their own
 *     PDS record — we go straight through the XRPC proxy with
 *     `com.atproto.repo.putRecord`.
 *   - When `targetDid !== ownDid`, the call is a group admin editing the
 *     group's marker — we route through the group BFF at
 *     `PUT /api/groups/[did]/metadata`, which proxies the write via the
 *     group service. The BFF route's allowlist (METADATA_FIELDS) controls
 *     which fields land on the record.
 *
 * Both paths take the same `GroupMetadata` body; the BFF adds the `$type`
 * server-side, while the XRPC path adds it inline.
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
): Promise<void> {
  if (targetDid !== ownDid) {
    const res = await authFetch(
      `/api/groups/${encodeURIComponent(targetDid)}/metadata`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      },
    )
    if (!res.ok) {
      throw new Error(await extractError(res, "Failed to update organization details"))
    }
    return
  }

  const res = await authFetch("/api/xrpc/com/atproto/repo/putRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: ORG_MARKER_COLLECTION,
      rkey: "self",
      record: {
        ...metadata,
        $type: ORG_MARKER_COLLECTION,
      },
    }),
  })
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to update organization details"))
  }
}
