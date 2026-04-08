import { NextRequest, NextResponse } from "next/server"
import { Agent } from "@atproto/api"
import type {
  ComAtprotoRepoPutRecord,
  ComAtprotoRepoDeleteRecord,
  ComAtprotoIdentityUpdateHandle,
  ComAtprotoServerRequestPasswordReset,
  ComAtprotoServerResetPassword,
  ComAtprotoServerUpdateEmail,
} from "@atproto/api"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { LIMIT_MIN, LIMIT_MAX } from "@/lib/utils/constants"

const ALLOWED_WRITE_COLLECTIONS = [
  "org.impactindexer.link.attestation",
  "app.certified.actor.profile",
  "app.certified.actor.membership",
  "app.certified.actor.organization",
]

const ALLOWED_BLOB_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]

const MAX_BLOB_SIZE = 4 * 1024 * 1024 // 4MB — Vercel serverless functions have a ~4.5MB request body limit

/** Extract a usable HTTP status + message from an unknown XRPC error. */
function xrpcError(err: unknown): { status: number; message: string } {
  const error = err as { status?: number; statusCode?: number; message?: string }
  const status = error?.status ?? error?.statusCode ?? 500
  const message =
    status >= 500
      ? "Internal server error"
      : (error?.message ?? "Internal server error")
  return { status, message }
}

/** Clamp and validate a limit query param. */
function parseLimit(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  if (isNaN(n)) return undefined
  return Math.min(Math.max(LIMIT_MIN, n), LIMIT_MAX)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ method: string[] }> }
) {
  try {
    const { method } = await params
    const methodName = method.join(".")

    const did = await getSessionDid()
    if (!did)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const client = await getOAuthClient()
    let oauthSession
    try {
      oauthSession = await client.restore(did)
    } catch {
      await deleteSession()
      return NextResponse.json({ error: "Session expired" }, { status: 401 })
    }
    const agent = new Agent(oauthSession)

    // Query params come as Record<string, string> from URLSearchParams.
    // AT Protocol SDK expects specific typed params — we validate the required
    // fields per-method below and cast through unknown for the proxy pattern.
    const queryParams: Record<string, string> = Object.fromEntries(
      request.nextUrl.searchParams.entries()
    )

    switch (methodName) {
      case "com.atproto.repo.getRecord": {
        const { repo, collection, rkey, cid } = queryParams
        if (!repo || !collection || !rkey) {
          return NextResponse.json({ error: "repo, collection, and rkey are required" }, { status: 400 })
        }
        const result = await agent.com.atproto.repo.getRecord({ repo, collection, rkey, cid })
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.listRecords": {
        const { repo, collection, cursor, reverse, rkeyEnd, rkeyStart } = queryParams
        if (!repo || !collection) {
          return NextResponse.json({ error: "repo and collection are required" }, { status: 400 })
        }
        const result = await agent.com.atproto.repo.listRecords({
          repo,
          collection,
          limit: parseLimit(queryParams.limit),
          cursor,
          reverse: reverse === "true" ? true : undefined,
          rkeyEnd,
          rkeyStart,
        })
        return NextResponse.json(result.data)
      }
      case "com.atproto.server.getSession": {
        const result = await agent.com.atproto.server.getSession()
        return NextResponse.json(result.data)
      }
      case "com.atproto.sync.getBlob": {
        const { did: blobDid, cid } = queryParams
        if (!blobDid || !cid) {
          return NextResponse.json({ error: "did and cid are required" }, { status: 400 })
        }
        const result = await agent.com.atproto.sync.getBlob({ did: blobDid, cid })
        const blob = result.data as Uint8Array
        return new NextResponse(Buffer.from(blob), {
          headers: {
            "Content-Type":
              result.headers["content-type"] || "application/octet-stream",
          },
        })
      }
      default:
        return NextResponse.json(
          { error: `Unknown method: ${methodName}` },
          { status: 400 }
        )
    }
  } catch (err: unknown) {
    const { status, message } = xrpcError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ method: string[] }> }
) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const { method } = await params
    const methodName = method.join(".")

    const did = await getSessionDid()
    if (!did)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const client = await getOAuthClient()
    let oauthSession
    try {
      oauthSession = await client.restore(did)
    } catch {
      await deleteSession()
      return NextResponse.json({ error: "Session expired" }, { status: 401 })
    }
    const agent = new Agent(oauthSession)

    // Parse body once (uploadBlob uses arrayBuffer instead)
    let body: Record<string, unknown> | null = null
    if (methodName !== "com.atproto.repo.uploadBlob") {
      body = await request.json()
    }

    // Validate repo on write methods — reject cross-repo writes
    const REPO_METHODS = ["com.atproto.repo.putRecord", "com.atproto.repo.deleteRecord"]
    if (body && REPO_METHODS.includes(methodName)) {
      if (body.repo && body.repo !== did) {
        return NextResponse.json(
          { error: "Forbidden: cannot write to another user's repo" },
          { status: 403 }
        )
      }
      // Collection allowlist
      if (
        body.collection &&
        !ALLOWED_WRITE_COLLECTIONS.includes(body.collection as string)
      ) {
        return NextResponse.json(
          { error: "Collection not allowed" },
          { status: 403 }
        )
      }
    }

    switch (methodName) {
      case "com.atproto.repo.putRecord": {
        const result = await agent.com.atproto.repo.putRecord(
          body as ComAtprotoRepoPutRecord.InputSchema
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.deleteRecord": {
        const result = await agent.com.atproto.repo.deleteRecord(
          body as ComAtprotoRepoDeleteRecord.InputSchema
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.uploadBlob": {
        const contentType =
          request.headers.get("content-type") || "application/octet-stream"
        // Check content type
        const mimeType = contentType.split(";")[0].trim()
        if (!ALLOWED_BLOB_CONTENT_TYPES.includes(mimeType)) {
          return NextResponse.json(
            { error: "Unsupported media type" },
            { status: 415 }
          )
        }
        // Check content length
        const contentLengthHeader = request.headers.get("content-length")
        if (contentLengthHeader && Number(contentLengthHeader) > MAX_BLOB_SIZE) {
          return NextResponse.json(
            { error: "Payload too large" },
            { status: 413 }
          )
        }
        const buffer = await request.arrayBuffer()
        if (buffer.byteLength > MAX_BLOB_SIZE) {
          return NextResponse.json(
            { error: "Payload too large" },
            { status: 413 }
          )
        }
        const result = await agent.com.atproto.repo.uploadBlob(
          new Uint8Array(buffer),
          { encoding: contentType }
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.identity.updateHandle": {
        await agent.com.atproto.identity.updateHandle(
          body as ComAtprotoIdentityUpdateHandle.InputSchema
        )
        // Void operation — no data to return
        return NextResponse.json({})
      }
      case "com.atproto.server.requestPasswordReset": {
        await agent.com.atproto.server.requestPasswordReset(
          body as ComAtprotoServerRequestPasswordReset.InputSchema
        )
        return NextResponse.json({})
      }
      case "com.atproto.server.resetPassword": {
        await agent.com.atproto.server.resetPassword(
          body as ComAtprotoServerResetPassword.InputSchema
        )
        return NextResponse.json({})
      }
      case "com.atproto.server.requestEmailUpdate": {
        const result = await agent.com.atproto.server.requestEmailUpdate()
        return NextResponse.json(result.data)
      }
      case "com.atproto.server.updateEmail": {
        await agent.com.atproto.server.updateEmail(
          body as ComAtprotoServerUpdateEmail.InputSchema
        )
        return NextResponse.json({})
      }
      default:
        return NextResponse.json(
          { error: `Unknown method: ${methodName}` },
          { status: 400 }
        )
    }
  } catch (err: unknown) {
    const { status, message } = xrpcError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
