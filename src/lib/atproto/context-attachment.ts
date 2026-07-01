import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { safeHttpUrl } from "@/lib/utils/safe-url"
import { writeToRepo } from "@/lib/atproto/repo-write"
import { extractError, xrpcGetRecordPath } from "@/lib/utils/api"

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

/**
 * An entry in `value.content[]`. The lexicon uses a union with two
 * known variants today:
 *
 *   - `org.hypercerts.defs#smallBlob` — a file blob (image, PDF, …)
 *     wrapped in a strong-typed envelope with mimeType + size.
 *   - `org.hypercerts.defs#uri` — an external link string.
 *
 * Renderers should branch on `$type` and only fall back to the legacy
 * "first blob is the hero" pattern when the `$type` is missing.
 */
export interface ContextAttachmentContentBlob {
  $type?: string
  blob?: {
    $type?: string
    ref?: { $link?: string } | string
    mimeType?: string
    size?: number
  }
  /** Present when `$type === "org.hypercerts.defs#uri"`. */
  uri?: string
}

export interface ContextAttachmentValue {
  $type?: string
  title?: string
  /** One- or two-line summary shown above the rich-text description. */
  shortDescription?: string
  contentType?: string
  subjects?: ContextAttachmentSubject[]
  content?: ContextAttachmentContentBlob[]
  description?: unknown
  createdAt?: string
  [key: string]: unknown
}

/** `$type` discriminator for a file/image blob entry in `content[]`. */
export const ATTACHMENT_BLOB_TYPE = "org.hypercerts.defs#smallBlob"

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
 * Create, or overwrite (when `opts.rkey` is given), an
 * `org.hypercerts.context.attachment` record. Dual-path via writeToRepo:
 *
 *   - `targetDid === ownDid` → the viewer writes to their own repo via
 *     the XRPC proxy (`createRecord` when minting, `putRecord` when
 *     editing in place).
 *   - `targetDid !== ownDid` → the viewer is acting as a group they
 *     admin → the BFF route at `/api/groups/<did>/update`.
 *
 * Updates are creator-only, so `targetDid` is always the author of the
 * subject the update targets (the repo the record lives in). Returns
 * `{ uri, cid }` so the caller can mirror the new commit without a
 * re-read. `opts.swapRecord` is only honoured on the edit path.
 */
export async function writeContextUpdate(
  ownDid: string,
  targetDid: string,
  record: ContextAttachmentValue,
  opts?: { rkey?: string; swapRecord?: string },
): Promise<{ uri: string; cid: string }> {
  const rkey = opts?.rkey
  const swap = opts?.swapRecord
  const body = { ...record, $type: CONTEXT_ATTACHMENT_COLLECTION }
  return writeToRepo<{ uri: string; cid: string }>({
    ownDid,
    targetDid,
    ownPath: rkey
      ? {
          url: "/api/xrpc/com/atproto/repo/putRecord",
          method: "POST",
          body: {
            repo: ownDid,
            collection: CONTEXT_ATTACHMENT_COLLECTION,
            rkey,
            record: body,
            ...(swap ? { swapRecord: swap } : {}),
          },
        }
      : {
          url: "/api/xrpc/com/atproto/repo/createRecord",
          method: "POST",
          body: {
            repo: ownDid,
            collection: CONTEXT_ATTACHMENT_COLLECTION,
            record: body,
          },
        },
    groupPath: {
      url: `/api/groups/${encodeURIComponent(targetDid)}/update`,
      method: "PUT",
      body: {
        ...(rkey ? { rkey } : {}),
        record: body,
        ...(rkey && swap ? { swapRecord: swap } : {}),
      },
    },
    errorFallback: "Failed to save update",
  })
}

/**
 * Delete an `org.hypercerts.context.attachment` record by rkey. Mirrors
 * `writeContextUpdate`'s dual-path routing: the viewer's own repo via
 * the XRPC proxy `deleteRecord`, or a group's repo via the BFF DELETE
 * route.
 */
export async function deleteContextUpdate(
  ownDid: string,
  targetDid: string,
  rkey: string,
): Promise<void> {
  if (targetDid !== ownDid) {
    const res = await authFetch(
      `/api/groups/${encodeURIComponent(targetDid)}/update`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rkey }),
      },
    )
    if (!res.ok) {
      throw new Error(await extractError(res, "Failed to delete update"))
    }
    return
  }
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: CONTEXT_ATTACHMENT_COLLECTION,
      rkey,
    }),
  })
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to delete update"))
  }
}

/**
 * Fetch a single `org.hypercerts.context.attachment` record by rkey from
 * `authorDid`'s repo (via the XRPC `getRecord` proxy). Returns null on
 * 400/404 (no such record). Used by the edit-update page to prefill the
 * form from the existing record.
 */
export async function getContextAttachment(
  authorDid: string,
  rkey: string,
  signal?: AbortSignal,
): Promise<ContextAttachmentRecord | null> {
  const res = await authFetch(
    xrpcGetRecordPath({
      repo: authorDid,
      collection: CONTEXT_ATTACHMENT_COLLECTION,
      rkey,
    }),
    signal ? { signal } : undefined,
  )
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return null
    throw new Error(`Failed to fetch update: ${res.status}`)
  }
  return (await res.json()) as ContextAttachmentRecord
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

export type ResolvedAttachment =
  | {
      kind: "image"
      cid: string
      mimeType: string
      size: number | null
    }
  | {
      kind: "file"
      cid: string
      mimeType: string
      size: number | null
    }
  | {
      kind: "uri"
      uri: string
    }

/**
 * Normalize the heterogeneous `content[]` union into one of three
 * render-friendly shapes:
 *
 *   - `image` — a blob whose mimeType starts with `image/`. Renderers
 *     show it as a thumbnail.
 *   - `file`  — any other blob (PDFs, audio, generic binaries). Show
 *     as a downloadable file tile.
 *   - `uri`   — an external link (`org.hypercerts.defs#uri`). Show as
 *     a link card.
 *
 * Returns null when the entry is too malformed to render (e.g. blob
 * variant with no resolvable CID).
 */
export function resolveAttachment(
  entry: ContextAttachmentContentBlob,
): ResolvedAttachment | null {
  if (entry.$type === "org.hypercerts.defs#uri") {
    if (typeof entry.uri !== "string" || entry.uri.length === 0) return null
    // Records come from a federated PDS, so the author controls this
    // string. Reject anything that isn't http(s) so render sinks can't
    // emit `<a href="javascript:…">` (stored XSS). See AGENTS.md §17.6.
    const safe = safeHttpUrl(entry.uri)
    if (!safe) return null
    return { kind: "uri", uri: safe }
  }

  // Treat anything else with a resolvable blob as a blob attachment.
  // The lexicon-canonical variant is `org.hypercerts.defs#smallBlob`,
  // but older / unknown blob $types still surface as files if the
  // CID resolves.
  const cid = extractContentBlobCid(entry)
  if (!cid) return null
  const mimeType =
    typeof entry.blob?.mimeType === "string" ? entry.blob.mimeType : ""
  const size = typeof entry.blob?.size === "number" ? entry.blob.size : null
  if (mimeType.startsWith("image/")) {
    return { kind: "image", cid, mimeType, size }
  }
  return { kind: "file", cid, mimeType, size }
}

/** Human-friendly file size — bytes → "12.4 KB" / "3.1 MB". Returns
 *  null when size is missing so the renderer can skip the line. */
export function formatAttachmentSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** Short label for a file's mimeType — falls back to "File" when the
 *  mimeType is missing or unrecognised. Used as the headline on file
 *  tiles ("PDF", "ZIP", …). */
export function mimeTypeLabel(mimeType: string): string {
  if (!mimeType) return "File"
  const sub = mimeType.split("/")[1] ?? ""
  if (!sub) return "File"
  // `application/pdf` → "PDF", `application/zip` → "ZIP",
  // `audio/mpeg` → "MPEG", etc. Strip trailing parameters /
  // codec suffixes after `+` (e.g. `image/svg+xml` → "SVG").
  const stripped = sub.split("+")[0].split(";")[0].toUpperCase()
  return stripped || "File"
}

/** Best-effort hostname for a URI attachment — strips protocol,
 *  drops `www.`, keeps the path host. Used as the tile headline. */
export function uriHost(uri: string): string {
  try {
    const u = new URL(uri)
    return u.hostname.replace(/^www\./, "")
  } catch {
    return uri
  }
}

/**
 * Extract a YouTube video ID from any of the URL shapes YouTube
 * publishes — watch URLs, short links, embeds, /shorts, /v. Returns
 * null when the input isn't a recognisable YouTube link or carries
 * a malformed ID.
 *
 * YouTube IDs are 11 chars, base64url alphabet (A-Z a-z 0-9 - _).
 * We validate the shape so a malformed URL can't smuggle an
 * arbitrary value into the thumbnail URL we render below.
 */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

function extractYouTubeId(uri: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return null
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase()

  let candidate: string | null = null
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (parsed.pathname === "/watch") {
      candidate = parsed.searchParams.get("v")
    } else {
      // /embed/ID, /v/ID, /shorts/ID, /live/ID
      const m = parsed.pathname.match(
        /^\/(?:embed|v|shorts|live)\/([^/?#]+)/,
      )
      candidate = m ? m[1] : null
    }
  } else if (host === "youtu.be") {
    // youtu.be/ID
    candidate = parsed.pathname.replace(/^\//, "").split("/")[0] || null
  }

  if (!candidate) return null
  return YOUTUBE_ID_RE.test(candidate) ? candidate : null
}

/**
 * Resolve a URI attachment to a thumbnail image URL when we know how
 * to derive one. Today: YouTube. Returns null when we don't have a
 * provider-specific shortcut — callers should fall back to the
 * generic external-link tile.
 *
 * The hqdefault.jpg endpoint exists for every uploaded YouTube
 * video (unlike maxresdefault, which is uploader-dependent).
 */
export function uriThumbnailUrl(uri: string): string | null {
  const ytId = extractYouTubeId(uri)
  if (ytId) {
    return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`
  }
  return null
}
