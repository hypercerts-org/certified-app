import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import {
  extractRecordRef,
  extractRouteError,
  parseJsonBody,
  pickAllowedFields,
} from "@/lib/utils/api"
import { enforceWriteRateLimit } from "@/lib/auth/rate-limit"
import { logSafe } from "@/lib/utils/log-safe"

const FUNDING_RECEIPT_COLLECTION = "org.hypercerts.funding.receipt"

// Mirror the `org.hypercerts.funding.receipt` lexicon. Allowlist on the BFF
// in line with sibling routes (`/activity`, `/profile`, `/location`) so an
// unknown/accidental key can't be persisted on the group's repo. The
// `from`/`to` union sub-objects and the `for` strongRef are kept verbatim
// (pickAllowedFields only filters top-level keys).
const ALLOWED_FUNDING_FIELDS = [
  "to",
  "from",
  "amount",
  "currency",
  "paymentRail",
  "paymentNetwork",
  "transactionId",
  "for",
  "matchingReceipt",
  "notes",
  "occurredAt",
  "createdAt",
] as const

/**
 * PUT /api/groups/[groupDid]/funding
 *
 * Create an `org.hypercerts.funding.receipt` on a group's repo so the
 * record's author is the group itself — required when a group records that
 * it *received* funding (the indexer derives the attestation role from
 * author-vs-from/to, so a recipient attestation for the group only lands
 * when the group authors the receipt). Used when the viewer is acting as
 * the group that owns the funded activity.
 *
 * The group service enforces that the authenticated viewer is an
 * owner/admin of the group and rejects writes from members.
 *
 * Body shape: `{ record: <funding receipt body> }`.
 * Returns `{ uri, cid }`.
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

    const parsed = await parseJsonBody(request, "[groups/funding]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const rawRecord = body.record
    if (!rawRecord || typeof rawRecord !== "object") {
      return NextResponse.json({ error: "record is required" }, { status: 400 })
    }
    const record = pickAllowedFields(
      rawRecord as Record<string, unknown>,
      ALLOWED_FUNDING_FIELDS,
      FUNDING_RECEIPT_COLLECTION,
    )

    // `funding.receipt` is rate-limited per-DID in the xrpc proxy, which
    // this BFF route bypasses entirely — so group-authored receipts were
    // unlimited. A receipt names a third party in `from`/`to`, which is
    // why the collection is in the registry at all: a scripted flood is a
    // reputational attack on someone who never consented to being named.
    // Counted against the ACTING operator, not the group.
    const denied = await enforceWriteRateLimit(
      auth.did,
      FUNDING_RECEIPT_COLLECTION,
      (err) => logSafe("[groups/funding] rate-limit check failed", err, { groupDid }),
    )
    if (denied) return denied

    const groupAgent = createGroupClient(auth.agent, groupDid)
    const upstream = await groupAgent.call(
      "app.certified.group.repo.createRecord",
      {},
      { repo: groupDid, collection: FUNDING_RECEIPT_COLLECTION, record },
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
    const { status, message, code } = extractRouteError(err)
    return NextResponse.json(
      { error: message, ...(code ? { code } : {}) },
      { status },
    )
  }
}

/**
 * DELETE /api/groups/[groupDid]/funding
 *
 * Remove an `org.hypercerts.funding.receipt` the group authored (take back a
 * group's recorded payment / confirmation). The group service enforces that
 * the authenticated viewer is an owner/admin of the group.
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
    const parsed = await parseJsonBody(request, "[groups/funding DELETE]")
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
      { repo: groupDid, collection: FUNDING_RECEIPT_COLLECTION, rkey },
      { encoding: "application/json" },
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const { status, message, code } = extractRouteError(err)
    return NextResponse.json(
      { error: message, ...(code ? { code } : {}) },
      { status },
    )
  }
}
