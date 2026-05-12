import { authFetch } from "@/lib/auth/fetch"
import type { ListRecordsResponse } from "@/lib/types/api"

export const ENDORSEMENT_COLLECTION = "app.certified.temp.graph.endorsement"

/**
 * The shape of the value inside an `app.certified.temp.graph.endorsement`
 * record as stored in a repo. See
 * `lexicons/app/certified/temp/graph/endorsement.json`.
 */
export interface EndorsementValue {
  $type?: typeof ENDORSEMENT_COLLECTION
  subject: { did: string }
  createdAt: string
}

/**
 * A single endorsement record as returned by `listRecords`, with the
 * rkey pre-extracted from the URI for convenient delete calls.
 */
export interface EndorsementRecord {
  uri: string
  cid: string
  rkey: string
  value: EndorsementValue
}


function extractRkey(uri: string): string {
  // at://did:plc:xxx/collection/rkey → rkey
  const idx = uri.lastIndexOf("/")
  return idx >= 0 ? uri.slice(idx + 1) : uri
}

/**
 * List all endorsements **given** by the subject. Reads the target
 * repo's `app.certified.temp.graph.endorsement` collection via
 * `com.atproto.repo.listRecords`. Works for any DID in the network —
 * the XRPC proxy resolves the target PDS for foreign repos. Safe to
 * call unauthenticated.
 */
export async function fetchGivenEndorsements(
  did: string,
  signal?: AbortSignal
): Promise<EndorsementRecord[]> {
  const params = new URLSearchParams({
    repo: did,
    collection: ENDORSEMENT_COLLECTION,
    limit: "100",
    reverse: "true",
  })

  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    signal ? { signal } : undefined
  )

  if (!res.ok) {
    // 400 / 404 = repo or collection doesn't exist yet → treat as empty
    if (res.status === 400 || res.status === 404) return []
    throw new Error(`Failed to list endorsements: ${res.status}`)
  }

  const data = (await res.json()) as ListRecordsResponse<EndorsementValue>
  const records = data.records ?? []

  return records.map((r) => ({
    uri: r.uri,
    cid: r.cid,
    rkey: extractRkey(r.uri),
    value: r.value,
  }))
}

/**
 * Create an endorsement record in the authenticated user's own repo
 * pointing at `subjectDid`. Returns the new record's URI and CID.
 */
export async function createEndorsement(
  ownDid: string,
  subjectDid: string
): Promise<{ uri: string; cid: string }> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: ENDORSEMENT_COLLECTION,
      record: {
        $type: ENDORSEMENT_COLLECTION,
        subject: { did: subjectDid },
        createdAt: new Date().toISOString(),
      } satisfies EndorsementValue,
    }),
  })

  const data = await res.json().catch(() => ({})) as { uri?: string; cid?: string; error?: string }

  if (!res.ok) {
    throw new Error(data.error || `Failed to create endorsement: ${res.status}`)
  }

  if (!data.uri || !data.cid) {
    throw new Error("Invalid response: missing uri or cid")
  }

  return { uri: data.uri, cid: data.cid }
}

/**
 * Delete an endorsement record (revoke an endorsement). Takes the
 * rkey the endorsement was stored under in the author's repo.
 */
export async function deleteEndorsement(
  ownDid: string,
  rkey: string
): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: ENDORSEMENT_COLLECTION,
      rkey,
    }),
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `Failed to delete endorsement: ${res.status}`)
  }
}
