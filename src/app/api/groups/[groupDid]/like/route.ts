import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRecordRef, extractRouteError, parseJsonBody } from "@/lib/utils/api"

const LIKE_COLLECTION = "app.certified.feed.like"

/** Longest at:// URI and CID accepted for the liked record. */
const MAX_URI_LEN = 512
const MAX_CID_LEN = 128

/**
 * POST /api/groups/[groupDid]/like
 *
 * Create an `app.certified.feed.like` record on a GROUP's repo: the group
 * likes an activity, a project or an update. The personal-repo path goes
 * through the XRPC proxy instead.
 *
 * Body shape: `{ subject: { uri: string, cid: string } }`, a strong
 * reference to the liked record. Returns `{ uri, cid }` of the like.
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

    const parsed = await parseJsonBody(request, "[groups/like]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const subject = (body.subject ?? null) as { uri?: unknown; cid?: unknown } | null
    const uri = typeof subject?.uri === "string" ? subject.uri : null
    const cid = typeof subject?.cid === "string" ? subject.cid : null
    if (
      !uri ||
      !cid ||
      !uri.startsWith("at://") ||
      uri.length > MAX_URI_LEN ||
      cid.length === 0 ||
      cid.length > MAX_CID_LEN
    ) {
      return NextResponse.json(
        { error: "subject must be a strong reference { uri: at://…, cid }" },
        { status: 400 },
      )
    }

    const record = {
      $type: LIKE_COLLECTION,
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    }

    const groupAgent = createGroupClient(auth.agent, groupDid)
    const upstream = await groupAgent.call(
      "app.certified.group.repo.createRecord",
      {},
      { repo: groupDid, collection: LIKE_COLLECTION, record },
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
 * DELETE /api/groups/[groupDid]/like
 *
 * Remove a group's like (unlike). Body shape: `{ rkey: string }`.
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

    const parsed = await parseJsonBody(request, "[groups/like DELETE]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const rkey = typeof body.rkey === "string" && body.rkey.length <= 64 ? body.rkey : null
    if (!rkey) {
      return NextResponse.json({ error: "rkey is required" }, { status: 400 })
    }

    const groupAgent = createGroupClient(auth.agent, groupDid)
    await groupAgent.call(
      "app.certified.group.repo.deleteRecord",
      {},
      { repo: groupDid, collection: LIKE_COLLECTION, rkey },
      { encoding: "application/json" },
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
