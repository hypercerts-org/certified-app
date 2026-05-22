import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"

export const CONTEXT_ATTACHMENT_COLLECTION = "org.hypercerts.context.attachment"

/**
 * Shape of an `org.hypercerts.context.attachment` record.
 *
 * Lives off-repo (no local lexicon file), so this type is best-effort:
 * the fields we render with are narrowed strictly; everything else
 * stays `unknown` for round-trip safety.
 *
 *   {
 *     title:        string                        // headline of the update
 *     contentType:  "update" | ...                // "update" is what we filter for
 *     subjects:     [{ uri, cid }]                // strong-refs to certs / projects this targets
 *     content?:     [SmallBlob]                   // optional images
 *     description?: pub.leaflet.pages.linearDocument
 *     createdAt:    datetime
 *   }
 */
export interface ContextAttachmentSubject {
  uri: string
  cid: string
}

export interface ContextAttachmentContentBlob {
  $type?: string
  blob?: {
    $type?: string
    ref?: { $link?: string } | string
    mimeType?: string
    size?: number
  }
}

export interface ContextAttachmentValue {
  $type?: string
  title?: string
  contentType?: string
  subjects?: ContextAttachmentSubject[]
  content?: ContextAttachmentContentBlob[]
  description?: unknown
  createdAt?: string
  [key: string]: unknown
}

export interface ContextAttachmentRecord {
  uri: string
  cid: string
  value: ContextAttachmentValue
}

/**
 * Page through `com.atproto.repo.listRecords` on `authorDid`'s PDS for
 * `org.hypercerts.context.attachment` records and return the subset
 * that match the filter predicate. Returns the first PDS-page of
 * results (50 by default) which is plenty for the per-cert / per-project
 * update list — pagination can come back if we ever need it.
 *
 * Indexer-backed fetch is the long-term plan (one query, cross-author,
 * filters server-side), but the indexer hasn't ingested this lexicon
 * yet (returns totalCount 0 on the live dev instance). Until it does,
 * we look on the target's author PDS only — which catches the common
 * case where an actor publishes updates about their own certs /
 * projects.
 */
export async function fetchContextAttachments(
  authorDid: string,
  filter: (value: ContextAttachmentValue) => boolean,
  signal?: AbortSignal,
): Promise<ContextAttachmentRecord[]> {
  const params = new URLSearchParams({
    repo: authorDid,
    collection: CONTEXT_ATTACHMENT_COLLECTION,
    limit: "50",
    reverse: "true",
  })

  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    signal ? { signal } : undefined,
  )

  if (!res.ok) {
    // 400/404 = the repo has never written one of these. Empty list,
    // not an error — matches `fetchCollections`'s convention.
    if (res.status === 400 || res.status === 404) return []
    throw new Error(`Failed to fetch context attachments: ${res.status}`)
  }

  const data = (await res.json()) as {
    records?: ContextAttachmentRecord[]
  }
  const records = data.records ?? []
  return records.filter((r) => filter(r.value))
}

/**
 * Convenience: fetch updates targeting a specific cert / project URI.
 *
 * Hard contract — **creator-only**: every returned record is authored
 * by the same DID that owns `subjectUri`. Third-party updates (an
 * actor publishing an attachment about someone else's cert / project)
 * are a separate feature and are silently dropped here.
 *
 * Two layers enforce this:
 *   1. The PDS-direct `listRecords` path is scoped to `authorDid`'s
 *      repo, so foreign records can't appear in the response.
 *   2. The post-fetch filter compares `record.uri`'s author DID to
 *      `subjectUri`'s author DID. This is defensive against (a)
 *      misuse — passing a non-matching `authorDid` — and (b) the
 *      future indexer-backed path (magic-indexer#111) which CAN
 *      surface third-party records and so MUST be filtered here.
 *
 * `contentType === "update"` is the filter the call sites care about;
 * other contentType values (`"context"`, future variants) are dropped.
 */
export async function fetchContextUpdates(
  authorDid: string,
  subjectUri: string,
  signal?: AbortSignal,
): Promise<ContextAttachmentRecord[]> {
  const subjectAuthor = parseAtUri(subjectUri)?.did ?? null

  return fetchContextAttachments(
    authorDid,
    (value) =>
      value.contentType === "update" &&
      Array.isArray(value.subjects) &&
      value.subjects.some(
        (s) => typeof s?.uri === "string" && s.uri === subjectUri,
      ),
    signal,
  ).then((records) =>
    // Layer 2 — explicit creator-only check on the attachment URI.
    records.filter((r) => {
      const recordAuthor = parseAtUri(r.uri)?.did ?? null
      return !!recordAuthor && recordAuthor === subjectAuthor
    }),
  )
}

/**
 * Resolve a content entry's blob $link to a CID string, applying the
 * magic-indexer#110 workaround (defensive — PDS reads should already
 * be in canonical shape, but the same util is used by indexer reads
 * elsewhere so callers don't have to think about it).
 */
export function extractContentBlobCid(
  entry: ContextAttachmentContentBlob,
): string | null {
  const ref = entry.blob?.ref
  if (!ref) return null
  if (typeof ref === "string") {
    const m = /^map\[\$link:([^\]]+)\]$/.exec(ref)
    return m ? m[1] : ref
  }
  if (typeof ref === "object" && typeof ref.$link === "string") {
    return ref.$link
  }
  return null
}
