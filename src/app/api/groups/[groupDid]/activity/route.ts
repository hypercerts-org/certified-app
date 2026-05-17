import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"

const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"

/**
 * PUT /api/groups/[groupDid]/activity
 *
 * Write (overwrite) an existing `org.hypercerts.claim.activity`
 * record on a group's repo. Used by the cert detail page's inline
 * edit when the cert lives on a group's PDS — group admins / owners
 * who've switched into the group can update title / short
 * description / image / description through this endpoint.
 *
 * Body shape:
 *   { rkey: string, record: <activity body> }
 *
 * `rkey` is required — this route only updates an existing cert.
 * Creating a fresh one happens through the activity-creation flow,
 * not the inline-edit surface.
 *
 * Returns `{ uri, cid }` so the client can mirror the new commit
 * locally without a re-read.
 */
export async function PUT(
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

    const parsed = await parseJsonBody(request, "[groups/activity]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const rkey = typeof body.rkey === "string" ? body.rkey : null
    if (!rkey) {
      return NextResponse.json(
        { error: "rkey is required" },
        { status: 400 },
      )
    }
    const rawRecord = body.record
    if (!rawRecord || typeof rawRecord !== "object") {
      return NextResponse.json(
        { error: "record is required" },
        { status: 400 },
      )
    }
    const record = { ...rawRecord, $type: ACTIVITY_COLLECTION } as Record<
      string,
      unknown
    >

    const groupAgent = createGroupAgent(auth.agent, groupDid)
    const upstream = await groupAgent.call(
      "app.certified.group.repo.putRecord",
      {},
      {
        repo: groupDid,
        collection: ACTIVITY_COLLECTION,
        rkey,
        record,
      },
      { encoding: "application/json" },
    )

    const data = (upstream as unknown as { data?: { uri?: string; cid?: string } })
      .data
    const uri = typeof data?.uri === "string" ? data.uri : null
    const cid = typeof data?.cid === "string" ? data.cid : null
    if (!uri || !cid) {
      return NextResponse.json(
        { error: "Upstream returned no record reference" },
        { status: 502 },
      )
    }
    return NextResponse.json({ uri, cid })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
