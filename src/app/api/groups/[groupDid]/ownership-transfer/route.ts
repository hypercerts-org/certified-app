import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  callGroupServiceJson,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"

/**
 * Ownership transfer (CGS >= 0.6.0) — the two-phase handshake behind
 * `app.certified.group.ownershipTransfer.*`. The owner proposes an existing
 * member; ownership moves only once that member accepts, which proves they
 * still control their DID. Either party can cancel, and an un-accepted
 * proposal lapses after 7 days.
 *
 * Disclosure rule (CGS contract): a member who is NOT a party to a pending
 * transfer gets exactly what they'd get if none existed — `pending: false`
 * from the status query, `NoPendingTransfer` from accept/cancel. We forward
 * those responses untouched; never try to distinguish "nothing pending" from
 * "not yours" here or in the UI, because the service deliberately makes them
 * indistinguishable.
 *
 * Requires the group service to be on 0.6.0+; a 0.5.0 deployment answers these
 * NSIDs with `501 MethodNotImplemented`, which surfaces as a plain upstream
 * error. That's gated by release (staging only until production's CGS is
 * upgraded), not by runtime detection.
 */

// 5 proposals per 10 min per DID. Proposing is owner-only and rare;
// the limit just bounds a loop that renews the same proposal (a
// re-propose restarts the 7-day window server-side).
const PROPOSE_LIMITER = makeLimiter("groups-transfer", 5, 600)

/**
 * GET /api/groups/[groupDid]/ownership-transfer
 * Report the pending transfer, if any. Callable by any member; details are
 * disclosed by CGS only to the two parties.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    // A query: `repo` goes on the querystring (CGS #27 targeting).
    const data = await callGroupServiceJson(
      auth.agent,
      "app.certified.group.ownershipTransfer.status",
      { query: { repo: groupDid } }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * POST /api/groups/[groupDid]/ownership-transfer
 * Propose a new owner (requires owner). The target must already be a member.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rateDenied = await enforceRateLimit(PROPOSE_LIMITER, auth.did)
    if (rateDenied) return rateDenied

    const parsed = await parseJsonBody(request, "[groups/ownership-transfer POST]")
    if (!parsed.ok) return parsed.response
    const { newOwner } = (parsed.body ?? {}) as { newOwner?: string }

    // CGS accepts a handle or a DID; the settings UI always sends the DID of
    // a member it already listed, so require that stricter form here.
    if (!newOwner || !isValidDid(newOwner)) {
      return NextResponse.json(
        { error: "newOwner must be a DID" },
        { status: 400 }
      )
    }

    const data = await callGroupServiceJson(
      auth.agent,
      "app.certified.group.ownershipTransfer.propose",
      { body: { repo: groupDid, newOwner } }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    const { status, message, code } = extractRouteError(err)
    return NextResponse.json({ error: message, code }, { status })
  }
}

/**
 * PUT /api/groups/[groupDid]/ownership-transfer
 * Accept a pending transfer. Callable only by the proposed member; CGS demotes
 * the previous owner to admin and promotes the caller atomically.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const data = await callGroupServiceJson(
      auth.agent,
      "app.certified.group.ownershipTransfer.accept",
      { body: { repo: groupDid } }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    const { status, message, code } = extractRouteError(err)
    return NextResponse.json({ error: message, code }, { status })
  }
}

/**
 * DELETE /api/groups/[groupDid]/ownership-transfer
 * Cancel a pending transfer — the owner revoking, or the proposed member
 * declining. Either party may call it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const data = await callGroupServiceJson(
      auth.agent,
      "app.certified.group.ownershipTransfer.cancel",
      { body: { repo: groupDid } }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    const { status, message, code } = extractRouteError(err)
    return NextResponse.json({ error: message, code }, { status })
  }
}
