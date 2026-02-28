/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { Agent } from "@atproto/api"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid } from "@/lib/auth/session"

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
    const oauthSession = await client.restore(did)
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
    const message = error?.message ?? "Internal server error"
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
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
    const oauthSession = await client.restore(did)
    const agent = new Agent(oauthSession)

    switch (methodName) {
      case "com.atproto.repo.putRecord": {
        const body = await request.json()
        const result = await agent.com.atproto.repo.putRecord(body)
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.deleteRecord": {
        const body = await request.json()
        const result = await agent.com.atproto.repo.deleteRecord(body)
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.uploadBlob": {
        const contentType =
          request.headers.get("content-type") || "application/octet-stream"
        const buffer = await request.arrayBuffer()
        const result = await agent.com.atproto.repo.uploadBlob(
          new Uint8Array(buffer),
          { encoding: contentType }
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.identity.updateHandle": {
        const body = await request.json()
        await agent.com.atproto.identity.updateHandle(body)
        return NextResponse.json({})
      }
      case "com.atproto.server.requestPasswordReset": {
        const body = await request.json()
        await agent.com.atproto.server.requestPasswordReset(body)
        return NextResponse.json({})
      }
      case "com.atproto.server.resetPassword": {
        const body = await request.json()
        await agent.com.atproto.server.resetPassword(body)
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
    const message = error?.message ?? "Internal server error"
    return NextResponse.json({ error: message }, { status })
  }
}
