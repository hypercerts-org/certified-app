import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import {
  extractRouteError,
  parseJsonBody,
  pickAllowedFields,
} from "@/lib/utils/api"

const PROJECT_COLLECTION = "org.hypercerts.collection"

/**
 * Fields the client may set on a project record via this route.
 * Per issue #67 plan A4:
 *   - Lexicon-defined: title, shortDescription, shortDescriptionFacets,
 *     description, avatar, banner, location.
 *   - Legacy fields some production records carry but aren't in the
 *     current `org.hypercerts.collection` lexicon: name, image,
 *     startDate, endDate, contributors. Kept so inline-edit saves
 *     don't silently drop them.
 *
 * `createdAt`, `type`, and `items` are deliberately NOT in this
 * list — they're server-pinned via read-modify-write below
 * (reviews B1 / B2 / B5).
 */
const PROJECT_FIELDS = [
  "title",
  "shortDescription",
  "shortDescriptionFacets",
  "description",
  "avatar",
  "banner",
  "location",
  // Legacy fields preserved for round-trip compatibility:
  "name",
  "image",
  "startDate",
  "endDate",
  "contributors",
] as const

/** atproto rkey charset per the spec — ≤512 chars of
 *  `A-Za-z0-9._:~-`. Validating client-side gives a clean 400
 *  instead of trusting upstream to reject. */
const RKEY_RE = /^[A-Za-z0-9._:~-]{1,512}$/

/**
 * PUT /api/groups/[groupDid]/project
 *
 * Write (overwrite) an existing `org.hypercerts.collection` record on
 * a group's repo. Used by the project detail page's inline edit when
 * the project lives on a group's PDS — group admins / owners who've
 * switched into the group can update title / short description /
 * description / hero image through this endpoint.
 *
 * Body shape:
 *   { rkey: string, record: <project body> }
 *
 * The route does a read-modify-write to server-pin three fields
 * regardless of what the client sends:
 *   - `createdAt` — prevents back/forward-dating the record.
 *   - `type`      — a project rkey stays a project; can't morph into
 *                   "favorites" / "portfolio" / "program".
 *   - `items`     — the inline-edit flow doesn't touch items; pinning
 *                   prevents a stale-client save from clobbering a
 *                   concurrent items[] change made elsewhere.
 *
 * Validation / shape correctness of nested unions, blob refs, and
 * strongRefs is delegated to the group service / PDS lexicon
 * validator — this route is field-name-level only.
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

    const parsed = await parseJsonBody(request, "[groups/project]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>

    const rkey = typeof body.rkey === "string" ? body.rkey : null
    if (!rkey) {
      return NextResponse.json(
        { error: "rkey is required" },
        { status: 400 },
      )
    }
    if (!RKEY_RE.test(rkey)) {
      return NextResponse.json(
        { error: "rkey is malformed" },
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

    // Mass-assignment-safe field allowlist (CS-005).
    const clientRecord = pickAllowedFields(
      rawRecord as Record<string, unknown>,
      PROJECT_FIELDS,
      PROJECT_COLLECTION,
    )

    // Read the stored record to server-pin createdAt / type / items.
    // Atproto records are public, so a plain fetch against the
    // group's PDS works — matches the read pattern in the
    // groups/profile and groups/metadata GET handlers. Failing to
    // fetch the existing record is a hard error (we can't safely
    // putRecord without knowing createdAt).
    const pdsUrl = await resolvePdsUrl(groupDid)
    if (!pdsUrl) {
      return NextResponse.json(
        { error: "Could not resolve group PDS" },
        { status: 404 },
      )
    }
    const existingRes = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord` +
        `?repo=${encodeURIComponent(groupDid)}` +
        `&collection=${encodeURIComponent(PROJECT_COLLECTION)}` +
        `&rkey=${encodeURIComponent(rkey)}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    if (!existingRes.ok) {
      const status = existingRes.status === 404 ? 404 : 502
      return NextResponse.json(
        {
          error:
            status === 404
              ? "Project record not found"
              : "Upstream getRecord failed",
        },
        { status },
      )
    }
    const existingData = (await existingRes.json()) as {
      value?: Record<string, unknown>
    }
    const existing = existingData.value ?? {}

    // Force-pin the three server-managed fields. Anything in the
    // client body for these keys is ignored — the allowlist already
    // dropped them but this is belt-and-suspenders.
    const record: Record<string, unknown> = {
      ...clientRecord,
      createdAt:
        typeof existing.createdAt === "string"
          ? existing.createdAt
          : new Date().toISOString(),
      // Default `type` to "project" if the stored record somehow
      // doesn't have one — this BFF route is project-semantic; we
      // never persist a non-project type via it.
      type: typeof existing.type === "string" ? existing.type : "project",
      // `items` is preserved verbatim — an opaque blob through the
      // allowlist. Inline-edit doesn't touch it; future flows that
      // DO edit items will use a different request shape.
      items: Array.isArray(existing.items) ? existing.items : [],
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)
    const upstream = await groupAgent.call(
      "app.certified.group.repo.putRecord",
      {},
      {
        repo: groupDid,
        collection: PROJECT_COLLECTION,
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
