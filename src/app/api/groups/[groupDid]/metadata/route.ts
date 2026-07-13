import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, pickAllowedFields, parseJsonBody } from "@/lib/utils/api"

const METADATA_FIELDS = [
  "organizationType",
  "urls",
  "location",
  "foundedDate",
  "longDescription",
  "createdAt",
] as const

/**
 * Short Cache-Control for the public GET read below — mirrors the
 * profile route's GROUP_READ_CACHE_HEADERS rationale: `private` so
 * the browser cache is invalidated by the same-URL PUT on save,
 * which a shared edge cache would not be. Error paths (including
 * the 404 absent case) stay uncached.
 */
const GROUP_READ_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30",
} as const

/**
 * GET /api/groups/[groupDid]/metadata
 * Read the org's app.certified.actor.organization record.
 * Reads go directly to the group's own PDS.
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

    const pdsUrl = await resolvePdsUrl(groupDid)
    if (!pdsUrl) {
      return NextResponse.json({ error: "Could not resolve group PDS" }, { status: 404 })
    }

    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(groupDid)}&collection=${encodeURIComponent("app.certified.actor.organization")}&rkey=self`,
      { signal: AbortSignal.timeout(10_000) }
    )

    if (!res.ok) {
      if (res.status === 400 || res.status === 404) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      throw new Error(`PDS returned ${res.status}`)
    }

    const data = await res.json()
    return NextResponse.json(data.value, { headers: GROUP_READ_CACHE_HEADERS })
  } catch (err: unknown) {
    // extractRouteError calls logSafe internally; bare console.error
    // duplicated the log and skipped the redactSecrets pass.
    const { status, message } = extractRouteError(err, "[groups/metadata/get]")
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * PUT /api/groups/[groupDid]/metadata
 * Update the group's metadata record.
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

    const parsed = await parseJsonBody(request, "[groups/metadata]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    // swapRecord — read before allowlist filter; envelope field.
    const swapRecord = typeof body.swapRecord === "string"
      ? body.swapRecord
      : undefined
    const record = pickAllowedFields(body, METADATA_FIELDS, "app.certified.actor.organization")
    const groupAgent = createGroupClient(auth.agent, groupDid)

    await groupAgent.call(
      "app.certified.group.repo.putRecord",
      {},
      {
        repo: groupDid,
        collection: "app.certified.actor.organization",
        rkey: "self",
        record,
        ...(swapRecord ? { swapRecord } : {}),
      },
      { encoding: "application/json" }
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
