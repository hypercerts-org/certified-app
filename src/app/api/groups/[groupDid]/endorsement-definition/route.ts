import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRecordRef, extractRouteError, parseJsonBody } from "@/lib/utils/api"

const BADGE_DEFINITION_COLLECTION = "app.certified.badge.definition"
const ENDORSEMENT_BADGE_TYPE = "endorsement"
const ENDORSEMENT_BADGE_TITLE = "Endorsement"

/**
 * POST /api/groups/[groupDid]/endorsement-definition
 *
 * Create the group's default `app.certified.badge.definition` record for
 * endorsements on the GROUP's repo. Used lazily by the client's
 * `ensureGroupEndorsementDefinition`: when acting as a group that has no
 * endorsement definition yet, the client mints one through this route so
 * subsequent group endorsements have a badge strongRef to point at.
 *
 * The body is intentionally ignored — every field is server-pinned to the
 * canonical endorsement definition shape so this route can only ever mint
 * an endorsement definition, never an arbitrary badge type.
 *
 * Returns `{ uri, cid }` so the client can use the new ref as the award's
 * `badge` without a re-read.
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

    // Body is ignored — the definition shape is fully server-pinned.
    const parsed = await parseJsonBody(request, "[groups/endorsement-definition]")
    if (!parsed.ok) return parsed.response

    const record = {
      $type: BADGE_DEFINITION_COLLECTION,
      badgeType: ENDORSEMENT_BADGE_TYPE,
      title: ENDORSEMENT_BADGE_TITLE,
      createdAt: new Date().toISOString(),
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)
    const upstream = await groupAgent.call(
      "app.certified.group.repo.createRecord",
      {},
      {
        repo: groupDid,
        collection: BADGE_DEFINITION_COLLECTION,
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
