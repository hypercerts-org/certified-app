/**
 * Document MIME types for blob attachment surfaces, shared by the two
 * upload paths — the XRPC proxy (`/api/xrpc/com.atproto.repo.uploadBlob`,
 * own repo) and the group BFF (`/api/groups/[groupDid]/upload-blob`).
 * Kept in a leaf module with no client-only imports so both server routes
 * and client code can read it.
 *
 * These are ADDITIVE. Each route keeps its own image allowlist as the
 * default — avatars, banners, hero images, rich-text embeds — and widens
 * to `image set + documents` only when the caller asks for it via
 * `?purpose=attachment` (update `content[]` blobs). A PDF must never be
 * accepted as an avatar, so the sets are never merged at rest.
 *
 * Deliberately excluded: `text/html` and `image/svg+xml`. Blobs are
 * served back from the PDS under its own origin, so either one is a
 * stored-XSS vector against that origin. Do not add them.
 */
export const ALLOWED_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]

/**
 * Query flag the client sets to request the wider document set —
 * `?purpose=attachment`. uploadBlob's body is raw bytes and its
 * Content-Type header carries the file's own MIME, so the selector has
 * to ride on the querystring rather than a header.
 */
export const BLOB_PURPOSE_PARAM = "purpose"
export const BLOB_PURPOSE_ATTACHMENT = "attachment"

/**
 * Read the attachment flag off a request URL. Tolerates a missing
 * `nextUrl` (some server-route tests build a minimal request object)
 * and falls back to `url`, defaulting to the narrow image set — the
 * safe direction if neither is present.
 */
export function isAttachmentUpload(request: {
  nextUrl?: { searchParams: URLSearchParams }
  url?: string
}): boolean {
  const params =
    request.nextUrl?.searchParams ??
    (request.url ? new URL(request.url).searchParams : null)
  return params?.get(BLOB_PURPOSE_PARAM) === BLOB_PURPOSE_ATTACHMENT
}

/**
 * Client-side ceiling for attachment uploads. Vercel caps serverless
 * request bodies at ~4.5MB, so anything above this fails at the platform
 * edge before either route runs — the client must reject it first to
 * give the user an accurate message instead of a dead round-trip.
 */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

/** `accept` attribute value for an attachment file picker. */
export const ATTACHMENT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  ...ALLOWED_DOCUMENT_CONTENT_TYPES,
].join(",")
