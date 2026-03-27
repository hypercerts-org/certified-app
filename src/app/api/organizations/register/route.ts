import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedAgent, getServiceAuthToken } from "@/lib/organizations/proxy-agent"
import { GROUP_SERVICE } from "@/lib/organizations/constants"
import { checkCsrf } from "@/lib/auth/csrf"

export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const body = await request.json()
    const { handle, ownerDid, email } = body as {
      handle: string
      ownerDid: string
      email?: string
    }

    if (!handle || !ownerDid) {
      return NextResponse.json(
        { error: "handle and ownerDid are required" },
        { status: 400 }
      )
    }

    // Ensure the caller can only register groups they own
    if (ownerDid !== auth.did) {
      return NextResponse.json(
        { error: "ownerDid must match authenticated user" },
        { status: 403 }
      )
    }

    // Get service auth JWT for group registration
    const token = await getServiceAuthToken(
      auth.agent,
      "app.certified.group.register"
    )

    // Call the group service directly (registration is the only direct call)
    const res = await fetch(
      `${GROUP_SERVICE}/xrpc/app.certified.group.register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ handle, ownerDid, email }),
      }
    )

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: (data as { message?: string }).message || `Registration failed: ${res.status}` },
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
