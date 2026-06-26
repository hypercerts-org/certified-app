import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRecordRef, extractRouteError, parseJsonBody } from "@/lib/utils/api"

const BADGE_RESPONSE_COLLECTION = "app.certified.badge.response"

/**
 * POST /api/groups/[groupDid]/response
 *
 * Create an `app.certified.badge.response` record on a GROUP's repo so the
 * group itself accepts/rejects an endorsement it received. Used when an
 * owner/admin acts as a group — without this BFF route the client-side
 * `createResponse` writes the response to the personal repo instead, which
 * would never affect the group's profile.
 *
 * Body shape:
 *   { award: { uri: string, cid: string }, response: "accepted" | "rejected",
 *     weight?: string }
 *
 * Returns `{ uri, cid }` so the client can mirror the new commit locally
 * without a re-read.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> },
) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const parsed = await parseJsonBody(request, "[groups/response]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>

    // Validate the award strongRef `{ uri, cid }` shape before forwarding so
    // a malformed reference returns a clean 400 instead of trusting upstream.
    const awardRaw = body.award
    const award =
      awardRaw && typeof awardRaw === "object"
        ? (awardRaw as Record<string, unknown>)
        : null
    const awardUri = award && typeof award.uri === "string" ? award.uri : null
    const awardCid = award && typeof award.cid === "string" ? award.cid : null
    if (!awardUri || !awardCid) {
      return NextResponse.json(
        { error: "award is required and must be a { uri, cid } strong ref" },
        { status: 400 },
      )
    }

    const response = body.response
    if (response !== "accepted" && response !== "rejected") {
      return NextResponse.json(
        { error: 'response must be "accepted" or "rejected"' },
        { status: 400 },
      )
    }

    const weight = typeof body.weight === "string" ? body.weight : undefined

    const record = {
      $type: BADGE_RESPONSE_COLLECTION,
      badgeAward: { uri: awardUri, cid: awardCid },
      response,
      ...(weight ? { weight } : {}),
      createdAt: new Date().toISOString(),
    }

    const groupAgent = createGroupClient(auth.agent, groupDid)
    const upstream = await groupAgent.call(
      "app.certified.group.repo.createRecord",
      {},
      {
        repo: groupDid,
        collection: BADGE_RESPONSE_COLLECTION,
        record,
      },
      { encoding: "application/json" },
    )

    const ref = extractRecordRef(upstream)
    if (!ref) {
      return NextResponse.json(
        { error: "Upstream returned no record reference" },
        { status: 502 },
      )
    }
    return NextResponse.json(ref)
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * DELETE /api/groups/[groupDid]/response
 *
 * Removes an `app.certified.badge.response` record from the group's repo
 * (reset-to-default). The authenticated viewer must be an owner / admin of
 * the group.
 *
 * Body shape: `{ rkey: string }`.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> },
) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const parsed = await parseJsonBody(request, "[groups/response DELETE]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const rkey = typeof body.rkey === "string" ? body.rkey : null
    if (!rkey) {
      return NextResponse.json({ error: "rkey is required" }, { status: 400 })
    }

    const groupAgent = createGroupClient(auth.agent, groupDid)
    await groupAgent.call(
      "app.certified.group.repo.deleteRecord",
      {},
      { repo: groupDid, collection: BADGE_RESPONSE_COLLECTION, rkey },
      { encoding: "application/json" },
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
