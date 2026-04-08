import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedAgent, getServiceAuthToken, createGroupAgent } from "@/lib/organizations/proxy-agent"
import { GROUP_SERVICE, GROUP_SERVICE_DID, MAX_SELF_CREATED_ORGS } from "@/lib/organizations/constants"
import { checkCsrf } from "@/lib/auth/csrf"
import { extractError } from "@/lib/utils/api"

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

    // Check org creation limit: fetch all memberships, then check addedBy
    try {
      const { data: { token: membershipToken } } =
        await auth.agent.com.atproto.server.getServiceAuth({
          aud: GROUP_SERVICE_DID,
          lxm: "app.certified.groups.membership.list",
        })

      const allGroups: { groupDid: string }[] = []
      let cursor: string | undefined
      do {
        const url = new URL(`${GROUP_SERVICE}/xrpc/app.certified.groups.membership.list`)
        url.searchParams.set("limit", "100")
        if (cursor) url.searchParams.set("cursor", cursor)

        const membershipsRes = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${membershipToken}` },
        })
        if (membershipsRes.ok) {
          const data = await membershipsRes.json()
          allGroups.push(...(data.groups || []))
          cursor = data.cursor
        } else {
          cursor = undefined
        }
      } while (cursor)

      // For each group, check if the user's member entry has addedBy === ownerDid
      const results = await Promise.all(
        allGroups.map(async (g) => {
          try {
            const groupAgent = createGroupAgent(auth.agent, g.groupDid)
            const allMembers: { did: string; addedBy: string }[] = []
            let memberCursor: string | undefined
            do {
              const params: Record<string, unknown> = { limit: 100 }
              if (memberCursor) params.cursor = memberCursor
              const { data } = await groupAgent.call(
                "app.certified.group.member.list",
                params
              )
              const page = data as { members?: { did: string; addedBy: string }[]; cursor?: string }
              allMembers.push(...(page.members || []))
              memberCursor = page.cursor
            } while (memberCursor)
            return allMembers.some(
              (m) => m.did === ownerDid && m.addedBy === ownerDid
            )
          } catch {
            return false
          }
        })
      )
      const selfCreatedCount = results.filter(Boolean).length

      if (selfCreatedCount >= MAX_SELF_CREATED_ORGS) {
        return NextResponse.json(
          { error: `You have reached the maximum number of organizations you can create (${MAX_SELF_CREATED_ORGS})` },
          { status: 403 }
        )
      }
    } catch (err) {
      console.error("Org creation limit check failed:", err)
      return NextResponse.json(
        { error: "Unable to verify organization creation limit. Please try again." },
        { status: 503 }
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
      return NextResponse.json(
        { error: await extractError(res, `Registration failed: ${res.status}`) },
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
