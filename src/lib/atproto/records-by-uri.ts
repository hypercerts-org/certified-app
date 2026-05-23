/**
 * Batch fetch atproto records by at:// URI.
 *
 * The Magic Indexer's GraphQL surface is keyset-paginated by indexed
 * order, so there's no "give me these N URIs" query. The /explore page's
 * "Recently viewed" filter needs exactly that — it has a localStorage
 * list of arbitrary URIs (possibly old) and wants the live records.
 *
 * Strategy: fan out N parallel `com.atproto.repo.getRecord` calls
 * through our existing XRPC proxy. Foreign PDSes federate transparently
 * (same path as `useActivity` / `useProject`). 404s are returned in a
 * `missing` array so the caller can prune the dead entries from the
 * cache.
 */

import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import type { ActivityRecord, ClaimActivity } from "@/lib/atproto/activity-types"
import type { CollectionRecord, CollectionValue } from "@/lib/atproto/collection"

interface GetRecordResponse {
  uri: string
  cid: string
  value: unknown
}

async function fetchOne(
  uri: string,
  signal?: AbortSignal,
): Promise<{ uri: string; record: GetRecordResponse | null }> {
  const parsed = parseAtUri(uri)
  if (!parsed) return { uri, record: null }
  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  })
  try {
    const res = await authFetch(
      `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
      { signal },
    )
    if (!res.ok) return { uri, record: null }
    const data = (await res.json()) as GetRecordResponse
    return { uri, record: data }
  } catch {
    // Network/abort errors are treated as "couldn't resolve" rather
    // than missing — we don't want to prune the cache on a flaky
    // connection. The caller distinguishes missing vs failed by
    // checking the abort signal.
    return { uri, record: null }
  }
}

interface FetchByUriResult<T> {
  /** Records that resolved, in the same order as the input URIs. */
  records: T[]
  /** URIs that returned 404 — caller should prune the cache. */
  missing: string[]
}

/**
 * Fetch activity claims by their at:// URIs. Returns records in the
 * same order as the input URIs, skipping any that 404'd. The dropped
 * URIs are returned in `missing` so callers can prune local caches.
 */
export async function fetchActivitiesByUris(
  uris: string[],
  signal?: AbortSignal,
): Promise<FetchByUriResult<ActivityRecord> & { dids: Map<string, string> }> {
  if (uris.length === 0) {
    return { records: [], missing: [], dids: new Map() }
  }
  const results = await Promise.all(uris.map((u) => fetchOne(u, signal)))
  if (signal?.aborted) {
    return { records: [], missing: [], dids: new Map() }
  }
  const records: ActivityRecord[] = []
  const missing: string[] = []
  const dids = new Map<string, string>()
  for (const { uri, record } of results) {
    if (!record) {
      missing.push(uri)
      continue
    }
    const parsed = parseAtUri(uri)
    if (!parsed) {
      missing.push(uri)
      continue
    }
    records.push({
      uri: record.uri,
      cid: record.cid,
      value: record.value as ClaimActivity,
    })
    dids.set(record.uri, parsed.did)
  }
  return { records, missing, dids }
}

/**
 * Fetch `org.hypercerts.collection` (project) records by their at://
 * URIs. Same semantics as `fetchActivitiesByUris`.
 */
export async function fetchProjectsByUris(
  uris: string[],
  signal?: AbortSignal,
): Promise<FetchByUriResult<CollectionRecord>> {
  if (uris.length === 0) return { records: [], missing: [] }
  const results = await Promise.all(uris.map((u) => fetchOne(u, signal)))
  if (signal?.aborted) return { records: [], missing: [] }
  const records: CollectionRecord[] = []
  const missing: string[] = []
  for (const { uri, record } of results) {
    if (!record) {
      missing.push(uri)
      continue
    }
    records.push({
      uri: record.uri,
      cid: record.cid,
      value: record.value as CollectionValue,
    })
  }
  return { records, missing }
}
