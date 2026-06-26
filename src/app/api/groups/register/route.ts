import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedAgent, getServiceAuthToken, createGroupClient } from "@/lib/groups/proxy-agent"
import { GROUP_SERVICE, GROUP_SERVICE_DID, MAX_SELF_CREATED_ORGS } from "@/lib/groups/constants"
import { checkCsrf } from "@/lib/auth/csrf"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"
import { sanitizeHandle } from "@/lib/utils/sanitize"
import { logSafe } from "@/lib/utils/log-safe"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"

// 5 / 10 min by session DID. Group registration is a privileged
// write (CGS-side state); cap per-DID. The route is auth-gated so
// IP-level enforcement is redundant.
const LIMITER = makeLimiter("groups-register", 5, 600)

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    // Rate-limit BEFORE CSRF — DID is known after auth, so RL keys
    // off the session DID. (Pre-auth check would have no identifier
    // for an authenticated route.)
    const rateDenied = await enforceRateLimit(LIMITER, auth.did)
    if (rateDenied) return rateDenied

    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const parsed = await parseJsonBody(request, "[groups/register]")
    if (!parsed.ok) return parsed.response
    const { handle: rawHandle, ownerDid, email: rawEmail } = (parsed.body ?? {}) as {
      handle?: string
      ownerDid?: string
      email?: string
    }

    if (!rawHandle || !ownerDid) {
      return NextResponse.json(
        { error: "handle and ownerDid are required" },
        { status: 400 }
      )
    }

    // Sanitize at the boundary (AGENTS.md §17.6/§24.5): strip invisible
    // chars / whitespace / leading @ even though the client also sanitizes.
    const handle = sanitizeHandle(rawHandle)

    if (!handle) {
      return NextResponse.json(
        { error: "handle and ownerDid are required" },
        { status: 400 }
      )
    }

    // AT Protocol handles are max 253 chars (DNS hostname limit). Re-check
    // the cap on the SANITIZED result so strippable padding can't smuggle an
    // over-length handle past the length guard.
    if (handle.length > 253) {
      return NextResponse.json(
        { error: "Handle too long (max 253 characters)" },
        { status: 400 }
      )
    }

    // Validate the optional email (feedback/route.ts's regex + 254-char cap).
    // Reject malformed input rather than forwarding it verbatim.
    let email: string | undefined
    if (typeof rawEmail === "string" && rawEmail.length > 0) {
      if (rawEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return NextResponse.json(
          { error: "Invalid email address" },
          { status: 400 }
        )
      }
      email = rawEmail
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
      // Process in batches of 5 with early exit once the limit is reached
      let selfCreatedCount = 0
      const BATCH_SIZE = 5
      for (let i = 0; i < allGroups.length; i += BATCH_SIZE) {
        if (selfCreatedCount >= MAX_SELF_CREATED_ORGS) break
        const batch = allGroups.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map(async (g) => {
            try {
              const groupAgent = createGroupClient(auth.agent, g.groupDid)
              // We only need to know whether the caller's OWN entry was
              // self-added, so stop paginating the member list as soon as that
              // entry is found — no later page can change the boolean answer.
              let memberCursor: string | undefined
              do {
                const params: Record<string, unknown> = {
                  repo: g.groupDid,
                  limit: 100,
                }
                if (memberCursor) params.cursor = memberCursor
                const { data } = await groupAgent.call(
                  "app.certified.group.member.list",
                  params
                )
                const page = data as { members?: { did: string; addedBy: string }[]; cursor?: string }
                const selfAdded = (page.members || []).some(
                  (m) => m.did === ownerDid && m.addedBy === ownerDid
                )
                if (selfAdded) return true
                memberCursor = page.cursor
              } while (memberCursor)
              return false
            } catch {
              return false
            }
          })
        )
        selfCreatedCount += results.filter(Boolean).length
      }

      if (selfCreatedCount >= MAX_SELF_CREATED_ORGS) {
        return NextResponse.json(
          { error: `You have reached the maximum number of groups you can create (${MAX_SELF_CREATED_ORGS})` },
          { status: 403 }
        )
      }
    } catch (err) {
      logSafe("[groups/register] org-limit check failed", err)
      return NextResponse.json(
        { error: "Unable to verify group creation limit. Please try again." },
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
      // Sanitize upstream 5xx — don't leak internal error details
      if (res.status >= 500) {
        return NextResponse.json(
          { error: "Registration failed" },
          { status: 502 }
        )
      }
      // Forward structured XRPC errors so the client can handle specific
      // codes like HandleNotAvailable as field-level errors.
      let errorCode: string | undefined
      let errorMessage = `Registration failed: ${res.status}`
      try {
        const data = await res.json() as { error?: string; message?: string }
        if (typeof data.error === "string") errorCode = data.error
        if (typeof data.message === "string") errorMessage = data.message
        else if (errorCode) errorMessage = errorCode
      } catch (err) {
        // Upstream returned a 4xx but the body wasn't JSON. Logging this
        // is useful because it usually points at the group service
        // returning HTML (e.g. an upstream proxy 502 wrapped as 4xx).
        logSafe("[groups/register] upstream non-JSON 4xx body", err, { status: res.status })
      }
      return NextResponse.json(
        { error: errorMessage, code: errorCode },
        { status: res.status }
      )
    }

    const result = await res.json()
    return NextResponse.json(result)
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
