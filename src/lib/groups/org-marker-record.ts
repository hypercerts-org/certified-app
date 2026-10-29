import { authFetch } from "@/lib/auth/fetch"
import { ORG_MARKER_COLLECTION } from "./constants"
import type { GroupMetadata } from "./types"

/**
 * Read an account's org marker (`app.certified.actor.organization/self`).
 *
 * Uses listRecords rather than getRecord: for an account without the marker
 * (every personal account) getRecord fails with RecordNotFound, which the
 * browser logs as a failed request on every profile view, while listRecords
 * answers 200 with an empty list. `no-store` because own-repo list reads are
 * otherwise cached for 5s, and editors re-read right after a write.
 *
 * Returns the record value, `null` when the account has no marker, or
 * `undefined` when the lookup itself failed (unknown — don't cache).
 */
export async function getOrgMarkerRecord(
  did: string,
  signal?: AbortSignal,
): Promise<GroupMetadata | null | undefined> {
  const params = new URLSearchParams({
    repo: did,
    collection: ORG_MARKER_COLLECTION,
    limit: "10",
  })
  const res = await authFetch(`/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`, {
    signal,
    cache: "no-store",
  })
  if (!res.ok) return undefined
  const data = (await res.json()) as { records?: Array<{ uri?: unknown; value?: unknown }> }
  const self = data.records?.find(
    (r) => typeof r.uri === "string" && r.uri.endsWith(`/${ORG_MARKER_COLLECTION}/self`),
  )
  return self?.value && typeof self.value === "object" ? (self.value as GroupMetadata) : null
}
