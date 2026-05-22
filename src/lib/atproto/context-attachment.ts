import { authFetch } from "@/lib/auth/fetch"

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
 * `contentType === "update"` is the filter the call sites care about;
 * other contentType values (`"context"`, future variants) are dropped.
 */
export async function fetchContextUpdates(
  authorDid: string,
  subjectUri: string,
  signal?: AbortSignal,
): Promise<ContextAttachmentRecord[]> {
  return fetchContextAttachments(
    authorDid,
    (value) =>
      value.contentType === "update" &&
      Array.isArray(value.subjects) &&
      value.subjects.some(
        (s) => typeof s?.uri === "string" && s.uri === subjectUri,
      ),
    signal,
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
