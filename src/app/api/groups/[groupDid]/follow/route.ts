import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRecordRef, extractRouteError, parseJsonBody } from "@/lib/utils/api"

const FOLLOW_COLLECTION = "app.certified.graph.follow"

/**
 * POST /api/groups/[groupDid]/follow
 *
 * Create an `app.certified.graph.follow` record on a GROUP's repo
 * (record's `subject` is the foreign account being followed). Used
 * by the sync flow when an owner/admin acts as a group and wants
 * the group itself to follow accounts — without this BFF route the
 * client-side `createFollow` writes to the personal repo instead.
 *
 * Body shape:
 *   { subjectDid: string, createdAt?: string }
 *
 * `createdAt` is optional. When present it must be a valid ISO-8601
 * timestamp; the route passes it through unchanged so the
 * social-graph sync flow can preserve the user's original follow
 * timestamp from Bluesky. When absent the server stamps the record
 * with the current time.
 *
 * Returns `{ uri, cid }` so the client can mirror the new commit
 * locally without a re-read.
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

    const parsed = await parseJsonBody(request, "[groups/follow]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const subjectDid = typeof body.subjectDid === "string" ? body.subjectDid : null
    if (!subjectDid || !isValidDid(subjectDid)) {
      return NextResponse.json(
        { error: "subjectDid is required and must be a valid DID" },
        { status: 400 },
      )
    }

    // Accept and validate an optional client-supplied createdAt.
    // Sync flow uses it to preserve the original Bluesky follow
    // time; absent → stamp now. Validate as a parseable ISO-8601
    // string so a junk value doesn't end up on the group's repo.
    const createdAtRaw =
      typeof body.createdAt === "string" ? body.createdAt : null
    const createdAt =
      createdAtRaw && !Number.isNaN(Date.parse(createdAtRaw))
        ? createdAtRaw
        : new Date().toISOString()

    const record = {
      $type: FOLLOW_COLLECTION,
      subject: subjectDid,
      createdAt,
    }

    const groupAgent = createGroupClient(auth.agent, groupDid)
    const upstream = await groupAgent.call(
      "app.certified.group.repo.createRecord",
      {},
      {
        repo: groupDid,
        collection: FOLLOW_COLLECTION,
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
 * DELETE /api/groups/[groupDid]/follow
 *
 * Removes an `app.certified.graph.follow` record from the group's repo via
 * `app.certified.group.repo.deleteRecord`. Used when an owner/admin acting
 * as a group unfollows an account — mirrors the POST above on the unfollow
 * side so the group's social graph is editable without writing to the
 * personal repo.
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

    const parsed = await parseJsonBody(request, "[groups/follow DELETE]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const rkey = typeof body.rkey === "string" ? body.rkey : null
    if (!rkey) {
      return NextResponse.json(
        { error: "rkey is required" },
        { status: 400 },
      )
    }

    const groupAgent = createGroupClient(auth.agent, groupDid)
    await groupAgent.call(
      "app.certified.group.repo.deleteRecord",
      {},
      { repo: groupDid, collection: FOLLOW_COLLECTION, rkey },
      { encoding: "application/json" },
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
