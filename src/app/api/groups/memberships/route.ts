import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedAgent } from "@/lib/groups/proxy-agent"
import { GROUP_SERVICE, GROUP_SERVICE_DID } from "@/lib/groups/constants"

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    // Get service auth JWT for listing memberships
    const { data: { token } } = await auth.agent.com.atproto.server.getServiceAuth({
      aud: GROUP_SERVICE_DID,
      lxm: "app.certified.groups.membership.list",
    })

    // Read optional query params
    const searchParams = request.nextUrl.searchParams
    const limitParam = searchParams.get("limit")
    const cursor = searchParams.get("cursor")

    const limit = Math.min(
      limitParam !== null ? parseInt(limitParam, 10) : 100,
      100
    )

    // Build URL with query params
    const url = new URL(`${GROUP_SERVICE}/xrpc/app.certified.groups.membership.list`)
    url.searchParams.set("limit", String(limit))
    if (cursor) {
      url.searchParams.set("cursor", cursor)
    }

    // Fetch from group service with service auth
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: (data as { message?: string }).message || `Request failed: ${res.status}` },
        { status: res.status }
      )
    }

    const result = await res.json()
    return NextResponse.json(result)
  } catch (err: unknown) {
    const error = err as { message?: string }
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}
