import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRecordRef, extractRouteError, parseJsonBody } from "@/lib/utils/api"

const BADGE_AWARD_COLLECTION = "app.certified.badge.award"

/** Max byte length we'll allow on `note` from the client. Mirrors the
 *  client-side `createEndorsementAward` cap so a write never gets
 *  rejected at the PDS for going over (badges.ts BADGE_AWARD_NOTE_MAX). */
const BADGE_AWARD_NOTE_MAX = 500

/**
 * POST /api/groups/[groupDid]/endorse
 *
 * Create an `app.certified.badge.award` record on a GROUP's repo so the
 * group itself endorses a foreign account. Used when an owner/admin acts
 * as a group — without this BFF route the client-side
 * `createEndorsementAward` writes the award to the personal repo instead.
 *
 * Body shape:
 *   { subject: string (DID), badge: { uri: string, cid: string }, note?: string }
 *
 * The award `subject` is wrapped in the canonical `app.certified.defs#did`
 * object form (object with a `did` property) — the magic-indexer's
 * `subject_did` generated column only extracts the DID from the object
 * form, so bare-string subjects are invisible to the "endorsements
 * received" filter. `note` is trimmed and truncated to 500 chars; an
 * empty/whitespace note is omitted entirely.
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

    const parsed = await parseJsonBody(request, "[groups/endorse]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>

    const subjectDid = typeof body.subject === "string" ? body.subject : null
    if (!subjectDid || !isValidDid(subjectDid)) {
      return NextResponse.json(
        { error: "subject is required and must be a valid DID" },
        { status: 400 },
      )
    }

    // The badge strongRef points at the group's endorsement definition.
    // Validate the `{ uri, cid }` shape before forwarding so a malformed
    // award returns a clean 400 instead of trusting upstream to reject.
    const badgeRaw = body.badge
    const badge =
      badgeRaw && typeof badgeRaw === "object"
        ? (badgeRaw as Record<string, unknown>)
        : null
    const badgeUri = badge && typeof badge.uri === "string" ? badge.uri : null
    const badgeCid = badge && typeof badge.cid === "string" ? badge.cid : null
    if (!badgeUri || !badgeCid) {
      return NextResponse.json(
        { error: "badge is required and must be a { uri, cid } strong ref" },
        { status: 400 },
      )
    }

    // Trim + truncate the note. Empty strings are omitted entirely so we
    // don't store noise that round-trips on every read.
    const noteRaw = typeof body.note === "string" ? body.note.trim() : ""
    const note = noteRaw ? noteRaw.slice(0, BADGE_AWARD_NOTE_MAX) : undefined

    const record = {
      $type: BADGE_AWARD_COLLECTION,
      badge: { uri: badgeUri, cid: badgeCid },
      // Canonical `app.certified.defs#did` shape: object with a `did`
      // property (see badges.ts writeBadgeAward).
      subject: { $type: "app.certified.defs#did", did: subjectDid },
      createdAt: new Date().toISOString(),
      ...(note ? { note } : {}),
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)
    const upstream = await groupAgent.call(
      "app.certified.group.repo.createRecord",
      {},
      {
        repo: groupDid,
        collection: BADGE_AWARD_COLLECTION,
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
 * DELETE /api/groups/[groupDid]/endorse
 *
 * Removes an `app.certified.badge.award` record from the group's repo via
 * `app.certified.group.repo.deleteRecord`. The authenticated viewer must
 * be an owner / admin of the group. Used to retract a group endorsement.
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

    const parsed = await parseJsonBody(request, "[groups/endorse DELETE]")
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
      { repo: groupDid, collection: BADGE_AWARD_COLLECTION, rkey },
      { encoding: "application/json" },
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
