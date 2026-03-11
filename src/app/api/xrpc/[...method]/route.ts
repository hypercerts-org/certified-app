/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { Agent } from "@atproto/api"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"

const ALLOWED_WRITE_COLLECTIONS = [
  "org.impactindexer.link.attestation",
  "app.certified.actor.profile",
]

const ALLOWED_BLOB_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]

const MAX_BLOB_SIZE = 4 * 1024 * 1024 // 4MB — Vercel serverless functions have a ~4.5MB request body limit

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

    const queryParams = Object.fromEntries(
      request.nextUrl.searchParams.entries()
    )

    switch (methodName) {
      case "com.atproto.repo.getRecord": {
        const result = await agent.com.atproto.repo.getRecord(
          queryParams as any
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.listRecords": {
        const result = await agent.com.atproto.repo.listRecords({
          ...queryParams,
          limit: queryParams.limit ? Number(queryParams.limit) : undefined,
        } as any)
        return NextResponse.json(result.data)
      }
      case "com.atproto.server.getSession": {
        const result = await agent.com.atproto.server.getSession()
        return NextResponse.json(result.data)
      }
      case "com.atproto.sync.getBlob": {
        const result = await agent.com.atproto.sync.getBlob(
          queryParams as any
        )
        return new NextResponse(result.data as any, {
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
    const error = err as { status?: number; statusCode?: number; message?: string }
    const status = error?.status ?? error?.statusCode ?? 500
    const message =
      status >= 500
        ? "Internal server error"
        : (error?.message ?? "Internal server error")
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
        const result = await agent.com.atproto.repo.putRecord(body as any)
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.deleteRecord": {
        const result = await agent.com.atproto.repo.deleteRecord(body as any)
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
        await agent.com.atproto.identity.updateHandle(body as any)
        return NextResponse.json({})
      }
      case "com.atproto.server.requestPasswordReset": {
        await agent.com.atproto.server.requestPasswordReset(body as any)
        return NextResponse.json({})
      }
      case "com.atproto.server.resetPassword": {
        await agent.com.atproto.server.resetPassword(body as any)
        return NextResponse.json({})
      }
      default:
        return NextResponse.json(
          { error: `Unknown method: ${methodName}` },
          { status: 400 }
        )
    }
  } catch (err: unknown) {
    const error = err as { status?: number; statusCode?: number; message?: string }
    const status = error?.status ?? error?.statusCode ?? 500
    const message =
      status >= 500
        ? "Internal server error"
        : (error?.message ?? "Internal server error")
    return NextResponse.json({ error: message }, { status })
  }
}
