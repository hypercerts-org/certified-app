import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, parseJsonBody, pickAllowedFields } from "@/lib/utils/api"

const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"

// Mirror the `org.hypercerts.claim.activity` lexicon (see
// `src/lib/atproto/activity-types.ts:ClaimActivity`). Allowlist on the
// BFF in line with sibling routes (`/profile`, `/metadata`,
// `/location`) — see AUDIT_REPORT.md CS-005 and AGENTS.md §17 #6.
const ALLOWED_ACTIVITY_FIELDS = [
  "title",
  "shortDescription",
  "createdAt",
  "shortDescriptionFacets",
  "description",
  "image",
  "contributors",
  "workScope",
  "startDate",
  "endDate",
  "locations",
  "rights",
] as const

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
    // Allowlist record fields. Without this, every property on the
    // caller's body — including unknown / future / accidental keys —
    // gets persisted on the group's repo. CGS may also validate
    // upstream but defense-in-depth on the BFF matches the pattern
    // used by sibling group routes (profile/metadata/location).
    const record = pickAllowedFields(
      rawRecord as Record<string, unknown>,
      ALLOWED_ACTIVITY_FIELDS,
      ACTIVITY_COLLECTION,
    )

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
