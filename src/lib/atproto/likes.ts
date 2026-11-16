import { authFetch } from "@/lib/auth/fetch"
import { postIndexer } from "@/lib/atproto/indexer-client"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { writeToRepo } from "@/lib/atproto/repo-write"
import { extractError } from "@/lib/utils/api"

/**
 * Likes on activities, projects and updates: `app.certified.feed.like`
 * records (`{ subject: strongRef, createdAt }`, schema-compatible with
 * Bluesky's like), written to the liker's own repository, or a group's
 * when they act as one. Social feedback only: the lexicon says a like
 * carries no meaning about the work (it is not an endorsement or an
 * evaluation).
 *
 * Two reads:
 *   - Counts come from the indexer, which needs the like lexicon and a
 *     `subject` filter. Where it lacks them the read reports `available:
 *     false` and the app shows likes without counts.
 *   - Whether an account liked something comes from that account's own
 *     repository (`listRecords`), so the Like button is right even
 *     before the indexer counts likes.
 */

export const LIKE_COLLECTION = "app.certified.feed.like"

export interface LikeTally {
  /** Accounts that like it (each counted once). */
  count: number
  /** Their DIDs, when the read listed them (a cut-short batch only
   *  counts); null otherwise. */
  likers: string[] | null
}

export interface LikesBatch {
  /** False when the indexer can't count likes yet. */
  available: boolean
  bySubject: Map<string, LikeTally>
}

interface LikeNode {
  uri: string
  did: string
  subject: { uri?: string | null } | null
}

interface LikesData {
  appCertifiedFeedLike: {
    totalCount: number | null
    edges: { node: LikeNode | null }[]
  } | null
}

/** Most likes read in one batch (the proxy's page cap). */
const LIKES_BATCH_FIRST = 100

/**
 * Like counts for the subjects on a page, in one request when it holds
 * them all; a batch with more likes than one page holds counts each
 * subject on its own. Throws on a failed request; a missing indexer
 * capability is not a failure but `available: false`.
 */
export async function fetchLikesForSubjects(
  subjectUris: readonly string[],
  signal?: AbortSignal,
): Promise<LikesBatch> {
  const bySubject = new Map<string, LikeTally>()
  if (subjectUris.length === 0) return { available: true, bySubject }
  const res = await postIndexer<LikesData>(
    "LikesForSubjects",
    { subjectUris, first: LIKES_BATCH_FIRST },
    { signal },
  )
  const conn = res.data?.appCertifiedFeedLike
  if (!conn) {
    // The indexer answers but doesn't know likes (no lexicon, or no
    // subject filter): a GraphQL error, not an outage.
    if (res.ok && res.errors.length > 0) return { available: false, bySubject }
    throw new Error(res.errors[0]?.message ?? `Couldn't load likes (${res.status})`)
  }
  const sets = new Map<string, Set<string>>(subjectUris.map((u) => [u, new Set()]))
  for (const edge of conn.edges) {
    const uri = edge.node?.subject?.uri
    if (!edge.node || !uri) continue
    sets.get(uri)?.add(edge.node.did)
  }
  const complete = (conn.totalCount ?? conn.edges.length) <= conn.edges.length
  if (complete) {
    for (const [uri, set] of sets) bySubject.set(uri, { count: set.size, likers: [...set] })
    return { available: true, bySubject }
  }
  await Promise.all(
    subjectUris.map(async (uri) => {
      const one = await postIndexer<LikesData>("LikeCount", { subjectUri: uri }, { signal })
      const count = one.data?.appCertifiedFeedLike?.totalCount
      if (typeof count === "number") bySubject.set(uri, { count, likers: null })
    }),
  )
  return { available: true, bySubject }
}

/** Pages of an account's likes read at most (100 each). */
const OWN_LIKES_MAX_PAGES = 10

/**
 * What an account has liked: subject URI → the like's URI. Read from the
 * account's own repository, newest first, up to 1,000 likes.
 */
export async function fetchOwnLikes(
  actorDid: string,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let cursor: string | undefined
  for (let page = 0; page < OWN_LIKES_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      repo: actorDid,
      collection: LIKE_COLLECTION,
      limit: "100",
    })
    if (cursor) params.set("cursor", cursor)
    const res = await authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
      signal ? { signal } : undefined,
    )
    if (!res.ok) {
      // 400/404: the account has never liked anything.
      if (res.status === 400 || res.status === 404) return out
      throw new Error(`Couldn't load likes (${res.status})`)
    }
    const data = (await res.json()) as {
      records?: { uri: string; value?: { subject?: { uri?: unknown } } }[]
      cursor?: string
    }
    for (const r of data.records ?? []) {
      const subject = r.value?.subject?.uri
      if (typeof subject === "string" && !out.has(subject)) out.set(subject, r.uri)
    }
    cursor = data.cursor
    if (!cursor || (data.records ?? []).length === 0) break
  }
  return out
}

/** Like `subject` as `actorDid` (you, or a group you act for). */
export async function likeRecord(
  ownDid: string,
  actorDid: string,
  subject: { uri: string; cid: string },
): Promise<{ uri: string; cid: string }> {
  const record = {
    $type: LIKE_COLLECTION,
    subject: { uri: subject.uri, cid: subject.cid },
    createdAt: new Date().toISOString(),
  }
  return writeToRepo<{ uri: string; cid: string }>({
    ownDid,
    targetDid: actorDid,
    ownPath: {
      url: "/api/xrpc/com/atproto/repo/createRecord",
      method: "POST",
      body: { repo: ownDid, collection: LIKE_COLLECTION, record },
    },
    groupPath: {
      url: `/api/groups/${encodeURIComponent(actorDid)}/like`,
      method: "POST",
      body: { subject: record.subject },
    },
    errorFallback: "Couldn't like it",
  })
}

/** Take a like back. */
export async function unlikeRecord(ownDid: string, actorDid: string, likeUri: string): Promise<void> {
  const rkey = parseAtUri(likeUri)?.rkey
  if (!rkey) throw new Error("Couldn't read the like's address")
  const res =
    actorDid === ownDid
      ? await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo: ownDid, collection: LIKE_COLLECTION, rkey }),
        })
      : await authFetch(`/api/groups/${encodeURIComponent(actorDid)}/like`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rkey }),
        })
  if (!res.ok) throw new Error(await extractError(res, "Couldn't remove the like"))
}
