import { authFetch } from "@/lib/auth/fetch"

const COLLECTION = "org.hypercerts.collection"

/**
 * Loose shape of an `org.hypercerts.collection` record. The lexicon
 * lives outside this repo so the fields below are best-effort — the
 * components consuming the records narrow as needed and treat anything
 * else as optional / unknown. The `type` discriminator is what the
 * Projects tab filters on (`type === "project"`).
 */
export interface CollectionValue {
  $type?: string
  type?: string
  title?: string
  name?: string
  description?: string
  shortDescription?: string
  createdAt?: string
  [key: string]: unknown
}

export interface CollectionRecord {
  uri: string
  cid: string
  value: CollectionValue
}

export interface ListCollectionsResponse {
  cursor?: string
  records: CollectionRecord[]
}

/**
 * List `org.hypercerts.collection` records on a DID's PDS with
 * cursor-based pagination. Returns an empty list (not an error) when
 * the user has never written a collection record — the PDS returns
 * 400 / 404 in that case.
 */
export async function fetchCollections(
  did: string,
  cursor?: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<ListCollectionsResponse> {
  const params = new URLSearchParams({
    repo: did,
    collection: COLLECTION,
    limit: String(limit),
    reverse: "true",
  })
  if (cursor) params.set("cursor", cursor)

  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    signal ? { signal } : undefined,
  )

  if (!res.ok) {
    if (res.status === 400 || res.status === 404) {
      return { records: [] }
    }
    throw new Error(`Failed to fetch collections: ${res.status}`)
  }

  const data = await res.json()
  return {
    records: data.records ?? [],
    cursor: data.cursor,
  }
}
