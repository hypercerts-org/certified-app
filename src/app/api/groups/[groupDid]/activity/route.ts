import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRecordRef, extractRouteError, parseJsonBody, pickAllowedFields } from "@/lib/utils/api"

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
 * Read/write an `org.hypercerts.claim.activity` record on a group's
 * repo:
 *   - `rkey` present → putRecord (overwrite existing cert; used by
 *     the cert detail page's inline edit when the cert lives on a
 *     group's PDS).
 *   - `rkey` absent  → createRecord (mint a fresh cert on the
 *     group's repo; used by /create when the active account is a
 *     group).
 *
 * Body shape:
 *   { rkey?: string, record: <activity body>, swapRecord?: string }
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
    // swapRecord is only meaningful on the putRecord (update) path —
    // createRecord doesn't accept it. Ignored when rkey is absent.
    const swapRecord =
      rkey && typeof body.swapRecord === "string"
        ? body.swapRecord
        : undefined
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
    const method = rkey
      ? "app.certified.group.repo.putRecord"
      : "app.certified.group.repo.createRecord"
    const requestBody = rkey
      ? {
          repo: groupDid,
          collection: ACTIVITY_COLLECTION,
          rkey,
          record,
          ...(swapRecord ? { swapRecord } : {}),
        }
      : {
          repo: groupDid,
          collection: ACTIVITY_COLLECTION,
          record,
        }

    const upstream = await groupAgent.call(method, {}, requestBody, {
      encoding: "application/json",
    })

    const ref = extractRecordRef(upstream)
    if (!ref) {
      return NextResponse.json(
        { error: "Upstream returned no record reference" },
        { status: 502 },
      )
    }
    return NextResponse.json(ref)
  } catch (err: unknown) {
    // Preserve the atproto error discriminator (`InvalidSwap`, …) in
    // `code` so the client write seam re-raises the typed error and
    // its conflict-rebase machinery runs — bug-003. The redacted
    // `message` is localised and never equals the discriminator.
    const { status, message, code } = extractRouteError(err)
    return NextResponse.json(
      { error: message, ...(code ? { code } : {}) },
      { status },
    )
  }
}

/**
 * DELETE /api/groups/[groupDid]/activity
 *
 * Removes an `org.hypercerts.claim.activity` record from the
 * group's repo via `app.certified.group.repo.deleteRecord`. The
 * authenticated viewer must be an owner / admin of the group; the
 * group service enforces that and rejects writes from members.
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
    const parsed = await parseJsonBody(request, "[groups/activity DELETE]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const rkey = typeof body.rkey === "string" ? body.rkey : null
    if (!rkey) {
      return NextResponse.json(
        { error: "rkey is required" },
        { status: 400 },
      )
    }
    const groupAgent = createGroupAgent(auth.agent, groupDid)
    await groupAgent.call(
      "app.certified.group.repo.deleteRecord",
      {},
      { repo: groupDid, collection: ACTIVITY_COLLECTION, rkey },
      { encoding: "application/json" },
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    // Preserve the atproto error discriminator (`InvalidSwap`, …) in
    // `code` so the client write seam re-raises the typed error and
    // its conflict-rebase machinery runs — bug-003. The redacted
    // `message` is localised and never equals the discriminator.
    const { status, message, code } = extractRouteError(err)
    return NextResponse.json(
      { error: message, ...(code ? { code } : {}) },
      { status },
    )
  }
}
