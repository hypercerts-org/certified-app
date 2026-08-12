import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError } from "@/lib/utils/api"
import {
  ALLOWED_DOCUMENT_CONTENT_TYPES,
  isAttachmentUpload,
} from "@/lib/atproto/blob-types"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
// Attachment surfaces (update `content[]` blobs, flagged with
// `?purpose=attachment`) additionally accept documents. Everything else
// stays image-only, so a PDF can never land as a group avatar or banner.
const ALLOWED_ATTACHMENT_TYPES = [
  ...ALLOWED_TYPES,
  ...ALLOWED_DOCUMENT_CONTENT_TYPES,
]
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * POST /api/groups/[groupDid]/upload-blob
 * Upload a blob to the group's repo via the group service proxy.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const contentType = request.headers.get("content-type") || "application/octet-stream"
    const mimeType = contentType.split(";")[0].trim()

    // Mirrors the XRPC proxy: `?purpose=attachment` widens the set to
    // documents for update `content[]` blobs; the default stays
    // image-only for avatars and banners.
    const allowedTypes = isAttachmentUpload(request)
      ? ALLOWED_ATTACHMENT_TYPES
      : ALLOWED_TYPES
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json({ error: "Unsupported media type" }, { status: 415 })
    }

    // Reject oversized uploads early via Content-Length before reading
    // the full body into memory.
    const contentLengthHeader = request.headers.get("content-length")
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_SIZE) {
      return NextResponse.json({ error: "Payload too large (max 5MB)" }, { status: 413 })
    }

    const buffer = await request.arrayBuffer()
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: "Payload too large (max 5MB)" }, { status: 413 })
    }

    const groupAgent = createGroupClient(auth.agent, groupDid)

    // uploadBlob has a binary body, so the group selector goes on the
    // querystring (body-less convention — see CGS aud-migration.md).
    const { data } = await groupAgent.call(
      "app.certified.group.repo.uploadBlob",
      { repo: groupDid },
      new Uint8Array(buffer),
      { encoding: contentType }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    // extractRouteError calls logSafe internally — no separate
    // console.error needed (would duplicate the log line and would
    // also bypass the redactSecrets pass).
    const { status, message } = extractRouteError(err, "[groups/upload-blob]")
    return NextResponse.json({ error: message }, { status })
  }
}
