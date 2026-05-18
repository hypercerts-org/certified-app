import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"

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
 *   { subjectDid: string }
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

    const record = {
      $type: FOLLOW_COLLECTION,
      subject: subjectDid,
      createdAt: new Date().toISOString(),
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)
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
