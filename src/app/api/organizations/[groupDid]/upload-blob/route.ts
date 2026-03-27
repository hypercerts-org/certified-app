import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/organizations/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * POST /api/organizations/[groupDid]/upload-blob
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
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const contentType = request.headers.get("content-type") || "application/octet-stream"
    const mimeType = contentType.split(";")[0].trim()

    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: "Unsupported media type" }, { status: 415 })
    }

    const buffer = await request.arrayBuffer()
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: "Payload too large (max 5MB)" }, { status: 413 })
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)

    const { data } = await groupAgent.call(
      "app.certified.group.repo.uploadBlob",
      {},
      new Uint8Array(buffer),
      { encoding: contentType }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error("Upload blob error:", err)
    const error = err as { status?: number; message?: string }
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: error?.status || 500 }
    )
  }
}
