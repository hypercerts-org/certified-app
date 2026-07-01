import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, pickAllowedFields, parseJsonBody } from "@/lib/utils/api"
import { logSafe } from "@/lib/utils/log-safe"

const PROFILE_FIELDS = ["displayName", "description", "pronouns", "website", "avatar", "banner", "createdAt"] as const

/**
 * GET /api/groups/[groupDid]/profile
 * Read the org's app.certified.actor.profile record.
 * Reads go directly to the group's own PDS (resolved from the DID document).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }

    // Resolve the group's PDS URL from the DID document. A DID that no
    // longer resolves (deleted / tombstoned / never-published) is an
    // EXPECTED absent-profile case — many feed/list rows reference group
    // DIDs whose profile record is simply gone (issue #156). Return 200
    // with a null body rather than 404 so the browser doesn't log a red
    // "Failed to load resource: 404" for every such row. Callers already
    // coerce a missing profile to null, so this is behaviourally identical
    // for them while removing the console noise. A genuine PDS failure
    // (5xx / network error) below still throws → 500, so "absent" and
    // "broken" stay distinguishable.
    const pdsUrl = await resolvePdsUrl(groupDid)
    if (!pdsUrl) {
      return NextResponse.json(null, { status: 200 })
    }

    // Fetch directly from the group's PDS (unauthenticated — reads are public)
    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(groupDid)}&collection=${encodeURIComponent("app.certified.actor.profile")}&rkey=self`,
      { signal: AbortSignal.timeout(10_000) }
    )

    if (!res.ok) {
      // 400/404 from the PDS = the `app.certified.actor.profile` record
      // doesn't exist (RecordNotFound) — the expected absent case, same
      // as an unresolvable PDS above. 200 + null, not 404.
      if (res.status === 400 || res.status === 404) {
        return NextResponse.json(null, { status: 200 })
      }
      throw new Error(`PDS returned ${res.status}`)
    }

    const data = await res.json()
    return NextResponse.json(data.value)
  } catch (err: unknown) {
    logSafe("[groups/profile] GET error", err)
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * PUT /api/groups/[groupDid]/profile
 * Update the org's profile. Uses custom NSID for writes.
 * Requires admin role.
 */
export async function PUT(
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

    const parsed = await parseJsonBody(request, "[groups/profile]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    // Read swapRecord off the raw body BEFORE the allowlist filter —
    // it's a top-level putRecord envelope field, not a profile-record
    // field, so it isn't in PROFILE_FIELDS. Forwarded to the upstream
    // call as the outer arg per the lexicon.
    const swapRecord = typeof body.swapRecord === "string"
      ? body.swapRecord
      : undefined
    const record = pickAllowedFields(body, PROFILE_FIELDS, "app.certified.actor.profile")
    const groupAgent = createGroupClient(auth.agent, groupDid)

    // Use custom NSID for writes — PDS proxies to group service
    await groupAgent.call(
      "app.certified.group.repo.putRecord",
      {},
      {
        repo: groupDid,
        collection: "app.certified.actor.profile",
        rkey: "self",
        record,
        ...(swapRecord ? { swapRecord } : {}),
      },
      { encoding: "application/json" }
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    // extractRouteError calls logSafe internally; bare console.error
    // would duplicate the log line and bypass the redactSecrets pass
    // that strips JWT/DPoP material from the atproto SDK's cause chain.
    const { status, message } = extractRouteError(err, "[groups/profile]")
    return NextResponse.json({ error: message }, { status })
  }
}
