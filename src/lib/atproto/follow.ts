"use client"

/**
 * Certified social-graph follow helpers.
 *
 * Writes `app.certified.graph.follow` records on the viewer's own PDS,
 * matching the lexicon shipping with the hypercerts-lexicon PR
 * `feature/add-graph-follow-lexicon`:
 *
 *   {
 *     subject:   did            (required)
 *     createdAt: datetime       (required)
 *     via?:      strongRef      (optional)
 *   }
 *
 * "Following" (records the viewer has authored) is a PDS-only read —
 * see `useFollowing`. "Followers" (records targeting the viewer) is an
 * indexer read — see `useFollowers` — and depends on the magic-indexer
 * exposing `appCertifiedGraphFollow` with a `subject.eq` filter (issue
 * tracked on hb-agent/magic-indexer).
 */

import { authFetch } from "@/lib/auth/fetch"
import { extractError } from "@/lib/utils/api"

export const FOLLOW_COLLECTION = "app.certified.graph.follow"

export interface FollowRecordValue {
  $type?: typeof FOLLOW_COLLECTION
  subject: string
  createdAt: string
  via?: { uri: string; cid: string }
}

export interface FollowRecord {
  uri: string
  cid: string
  rkey: string
  value: FollowRecordValue
}

interface ListRecordsResponse<T> {
  cursor?: string
  records: { uri: string; cid: string; value: T }[]
}

function extractRkey(uri: string): string {
  const idx = uri.lastIndexOf("/")
  return idx >= 0 ? uri.slice(idx + 1) : uri
}

/**
 * Create a follow record pointing at `subjectDid`.
 *
 * Routing:
 *   - Default: writes to `ownDid`'s personal PDS via the XRPC proxy.
 *   - With `targetDid` (acting-as-group): writes to the group's repo
 *     via the BFF route at `/api/groups/[targetDid]/follow`. Mirrors
 *     `putCertRecord` — XRPC for own DID, BFF for group writes.
 *
 * The caller is responsible for not creating duplicates — the
 * lexicon notes the AppView will dedupe but the PDS itself accepts
 * duplicates.
 */
export async function createFollow(
  ownDid: string,
  subjectDid: string,
  opts?: { targetDid?: string; createdAt?: string },
): Promise<{ uri: string; cid: string }> {
  const createdAt = opts?.createdAt ?? new Date().toISOString()
  if (opts?.targetDid && opts.targetDid !== ownDid) {
    const res = await authFetch(
      `/api/groups/${encodeURIComponent(opts.targetDid)}/follow`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectDid, createdAt }),
      },
    )
    if (!res.ok) {
      throw new Error(await extractError(res, "Failed to create follow on group"))
    }
    const data = (await res.json()) as { uri?: string; cid?: string }
    if (!data.uri || !data.cid) {
      throw new Error("createFollow: upstream returned no record reference")
    }
    return { uri: data.uri, cid: data.cid }
  }

  const body = {
    repo: ownDid,
    collection: FOLLOW_COLLECTION,
    record: {
      $type: FOLLOW_COLLECTION,
      subject: subjectDid,
      createdAt,
    } satisfies FollowRecordValue,
  }
  const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to create follow"))
  }
  const data = (await res.json()) as { uri?: string; cid?: string }
  if (!data.uri || !data.cid) {
    throw new Error("createFollow: upstream returned no record reference")
  }
  return { uri: data.uri, cid: data.cid }
}

/** Delete a follow record by rkey on the viewer's own PDS. */
export async function deleteFollow(
  ownDid: string,
  rkey: string,
): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: FOLLOW_COLLECTION,
      rkey,
    }),
  })
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to delete follow"))
  }
}

/**
 * Read every `app.certified.graph.follow` record on `did`'s repo via
 * the PDS proxy. Caller-controlled abort signal so the consuming hook
 * can cancel inflight pages on re-mount. Paginates to a safety cap
 * (10_000) to avoid runaway loops on adversarial repos.
 */
export async function listFollowing(
  did: string,
  signal?: AbortSignal,
  opts?: { noCache?: boolean },
): Promise<{ records: FollowRecord[]; truncated: boolean }> {
  const PAGE_SIZE = 100
  const SAFETY_CAP = 10_000
  const out: FollowRecord[] = []
  let cursor: string | undefined
  let truncated = false
  while (out.length < SAFETY_CAP) {
    const params = new URLSearchParams({
      repo: did,
      collection: FOLLOW_COLLECTION,
      limit: String(PAGE_SIZE),
    })
    if (cursor) params.set("cursor", cursor)
    const init: RequestInit = {}
    if (signal) init.signal = signal
    // Post-write refetches need to bypass the proxy's 5s same-session
    // cache (matches the pattern used by listDefinitions in badges.ts).
    if (opts?.noCache) init.cache = "no-store"
    const res = await authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
      init,
    )
    if (!res.ok) {
      // 400/404 on an empty / not-yet-created collection — treat as
      // "no follows" rather than an error.
      if (res.status === 400 || res.status === 404) {
        return { records: out, truncated: false }
      }
      throw new Error(`Failed to list follows: ${res.status}`)
    }
    const data = (await res.json()) as ListRecordsResponse<FollowRecordValue>
    for (const r of data.records ?? []) {
      out.push({
        uri: r.uri,
        cid: r.cid,
        rkey: extractRkey(r.uri),
        value: r.value,
      })
    }
    cursor = data.cursor
    if (!cursor || (data.records?.length ?? 0) < PAGE_SIZE) break
  }
  // Hit the safety cap *and* there's still a cursor pointing at more
  // pages — caller's derived sets (count, subjects-for-set-arithmetic)
  // are now incomplete. Surface this so consumers can show a "10,000+"
  // indicator or refuse to compute set arithmetic.
  if (out.length >= SAFETY_CAP && cursor) {
    truncated = true
  }
  return { records: out, truncated }
}
