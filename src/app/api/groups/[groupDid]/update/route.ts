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

const UPDATE_COLLECTION = "org.hypercerts.context.attachment"

// Mirror the `org.hypercerts.context.attachment` shape (see
// `src/lib/atproto/context-attachment.ts:ContextAttachmentValue`).
// Allowlist on the BFF in line with sibling routes (`/activity`,
// `/profile`, `/location`) — see AGENTS.md §17 #6.
const ALLOWED_UPDATE_FIELDS = [
  "title",
  "shortDescription",
  "contentType",
  "subjects",
  "content",
  "description",
  "createdAt",
] as const

/**
 * PUT /api/groups/[groupDid]/update
 *
 * Read/write an `org.hypercerts.context.attachment` record on a group's
 * repo — the "update" posts shown on a group's activity / project
 * detail pages:
 *   - `rkey` present → putRecord (edit an existing update).
 *   - `rkey` absent  → createRecord (post a new update).
 *
 * Body shape: `{ rkey?: string, record: <attachment body>, swapRecord?: string }`.
 * Returns `{ uri, cid }` so the client can mirror the new commit.
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

    const parsed = await parseJsonBody(request, "[groups/update]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const rkey = typeof body.rkey === "string" ? body.rkey : null
    // swapRecord is only meaningful on the putRecord (edit) path.
    const swapRecord =
      rkey && typeof body.swapRecord === "string" ? body.swapRecord : undefined
    const rawRecord = body.record
    if (!rawRecord || typeof rawRecord !== "object") {
      return NextResponse.json({ error: "record is required" }, { status: 400 })
    }
    const record = pickAllowedFields(
      rawRecord as Record<string, unknown>,
      ALLOWED_UPDATE_FIELDS,
      UPDATE_COLLECTION,
    )

    const groupAgent = createGroupClient(auth.agent, groupDid)
    const method = rkey
      ? "app.certified.group.repo.putRecord"
      : "app.certified.group.repo.createRecord"
    const requestBody = rkey
      ? {
          repo: groupDid,
          collection: UPDATE_COLLECTION,
          rkey,
          record,
          ...(swapRecord ? { swapRecord } : {}),
        }
      : {
          repo: groupDid,
          collection: UPDATE_COLLECTION,
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
    // `code` so the client write seam re-raises the typed error.
    const { status, message, code } = extractRouteError(err)
    return NextResponse.json(
      { error: message, ...(code ? { code } : {}) },
      { status },
    )
  }
}

/**
 * DELETE /api/groups/[groupDid]/update
 *
 * Removes an `org.hypercerts.context.attachment` record from the group's
 * repo via `app.certified.group.repo.deleteRecord`. The group service
 * enforces that the authenticated viewer is an owner / admin.
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
    const parsed = await parseJsonBody(request, "[groups/update DELETE]")
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
      { repo: groupDid, collection: UPDATE_COLLECTION, rkey },
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
