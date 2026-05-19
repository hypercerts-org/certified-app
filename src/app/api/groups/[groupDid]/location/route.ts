import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"

const LOCATION_COLLECTION = "app.certified.location"
const ALLOWED_LOCATION_FIELDS = new Set([
  "$type",
  "lpVersion",
  "srs",
  "locationType",
  "location",
  "name",
  "description",
  "createdAt",
])

/**
 * PUT /api/groups/[groupDid]/location
 *
 * Write a `app.certified.location` record on a group's repo. The
 * group's profile editor uses this to persist the inline location
 * picker's `(name, lat, lng)`; the resulting strongRef is then
 * referenced from the group's `app.certified.actor.organization`
 * marker.
 *
 * Body shape:
 *   { rkey?: string, record: <app.certified.location body> }
 *
 * When `rkey` is provided we putRecord (in-place update); otherwise
 * createRecord with a PDS-assigned TID. Returns `{ uri, cid }` so the
 * caller can embed the strongRef.
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

    const parsed = await parseJsonBody(request, "[groups/location]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const rkey = typeof body.rkey === "string" ? body.rkey : undefined
    // swapRecord — only meaningful on the putRecord (rkey-bound)
    // path; createRecord doesn't take it. Ignored when rkey is
    // absent.
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

    // Allowlist-filter the record body — drops any unexpected fields
    // a misbehaving client might try to ship in.
    const record: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rawRecord)) {
      if (ALLOWED_LOCATION_FIELDS.has(k)) record[k] = v
    }
    record.$type = LOCATION_COLLECTION

    const groupAgent = createGroupAgent(auth.agent, groupDid)

    const method = rkey
      ? "app.certified.group.repo.putRecord"
      : "app.certified.group.repo.createRecord"
    const requestBody = rkey
      ? {
          repo: groupDid,
          collection: LOCATION_COLLECTION,
          rkey,
          record,
          ...(swapRecord ? { swapRecord } : {}),
        }
      : {
          repo: groupDid,
          collection: LOCATION_COLLECTION,
          record,
        }

    const upstream = await groupAgent.call(method, {}, requestBody, {
      encoding: "application/json",
    })

    const data = (upstream as unknown as { data?: { uri?: string; cid?: string } })
      .data
    const uri = typeof data?.uri === "string" ? data.uri : null
    const cid = typeof data?.cid === "string" ? data.cid : null
    if (!uri || !cid) {
      return NextResponse.json(
        { error: "Upstream returned no strongRef" },
        { status: 502 },
      )
    }
    return NextResponse.json({ uri, cid })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
