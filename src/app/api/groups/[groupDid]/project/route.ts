import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import {
  extractRecordRef,
  extractRouteError,
  parseJsonBody,
  pickAllowedFields,
} from "@/lib/utils/api"

const PROJECT_COLLECTION = "org.hypercerts.collection"

/**
 * Fields the client may set on a project record via this route.
 *   - Lexicon-defined: title, shortDescription, shortDescriptionFacets,
 *     description, avatar, banner, location.
 *   - `items` — the list of certs (strongRefs) that belong to the
 *     project. Now editable from the inline-edit UI; validated as an
 *     array of `{ itemIdentifier: { uri, cid }, ... }` below.
 *   - Legacy fields some production records carry but aren't in the
 *     current `org.hypercerts.collection` lexicon: name, image,
 *     startDate, endDate, contributors. Kept so inline-edit saves
 *     don't silently drop them.
 *
 * `createdAt` and `type` are deliberately NOT in this list —
 * server-pinned via read-modify-write below (reviews B1 / B2).
 */
const PROJECT_FIELDS = [
  "title",
  "shortDescription",
  "shortDescriptionFacets",
  "description",
  "avatar",
  "banner",
  "location",
  "items",
  // Legacy fields preserved for round-trip compatibility:
  "name",
  "image",
  "startDate",
  "endDate",
  "contributors",
] as const

/**
 * Shape-validate items[] before passing through to the PDS. The
 * lexicon allows extra fields on each item (e.g. `itemWeight`,
 * `addedAt`), so this only enforces the minimum invariant: it's an
 * array, and every entry has an `itemIdentifier: { uri, cid }`
 * strong-ref. Anything else on the entry is preserved verbatim.
 *
 * Returns `null` when the value is well-formed; an error string
 * otherwise. The route 400s with that string so the client can
 * surface it directly. */
function validateItems(value: unknown): string | null {
  if (value === undefined) return null
  if (!Array.isArray(value)) return "items must be an array"
  for (let i = 0; i < value.length; i++) {
    const it = value[i]
    if (!it || typeof it !== "object") {
      return `items[${i}] must be an object`
    }
    const id = (it as Record<string, unknown>).itemIdentifier
    if (!id || typeof id !== "object") {
      return `items[${i}].itemIdentifier is required`
    }
    const idObj = id as Record<string, unknown>
    if (typeof idObj.uri !== "string" || !idObj.uri.startsWith("at://")) {
      return `items[${i}].itemIdentifier.uri must be an at:// URI`
    }
    if (typeof idObj.cid !== "string" || idObj.cid.length === 0) {
      return `items[${i}].itemIdentifier.cid is required`
    }
  }
  return null
}

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
 * The route does a read-modify-write to server-pin two fields
 * regardless of what the client sends:
 *   - `createdAt` — prevents back/forward-dating the record.
 *   - `type`      — a project rkey stays a project; can't morph into
 *                   "favorites" / "portfolio" / "program".
 *
 * `items` IS client-writable (the inline-edit UI manages add/remove
 * via the project edit page). The shape is validated by
 * `validateItems` above so a malformed save returns 400 before
 * touching the PDS. Concurrent items[] writes can clobber each
 * other — the client always sends the full array from its last
 * read, so a stale tab's save can overwrite an unrelated add. This
 * is the same lost-update risk every PUT-based edit has today.
 *
 * Validation / shape correctness of nested unions, blob refs, and
 * strongRefs (beyond items[]) is delegated to the group service /
 * PDS lexicon validator — this route is field-name-level only.
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
    if (rkey !== null && !RKEY_RE.test(rkey)) {
      return NextResponse.json(
        { error: "rkey is malformed" },
        { status: 400 },
      )
    }

    // swapRecord — putRecord envelope field, sibling of `record`.
    // Only meaningful on the update path; ignored when creating.
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

    // Mass-assignment-safe field allowlist (CS-005).
    const clientRecord = pickAllowedFields(
      rawRecord as Record<string, unknown>,
      PROJECT_FIELDS,
      PROJECT_COLLECTION,
    )

    // Shape-validate items[] before forwarding. `pickAllowedFields`
    // only filters by key, not value shape, so without this an
    // attacker (or a buggy client) could still send `items: "oops"`
    // or items[i] without an itemIdentifier and let the PDS handle
    // it. Catch it here for a clean 400 instead.
    const itemsError = validateItems(
      (clientRecord as Record<string, unknown>).items,
    )
    if (itemsError) {
      return NextResponse.json({ error: itemsError }, { status: 400 })
    }

    // Two branches:
    //   - rkey present: read-modify-write on putRecord (existing
    //     update flow). createdAt / type pinned from the stored
    //     record so the client can't back-date or morph the type.
    //   - rkey absent : createRecord on a fresh TID. Server-pins
    //     createdAt = now and defaults type = "project" — this
    //     route is project-semantic; we never mint a non-project
    //     record through it.
    let record: Record<string, unknown>
    if (rkey) {
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
      record = {
        ...clientRecord,
        createdAt:
          typeof existing.createdAt === "string"
            ? existing.createdAt
            : new Date().toISOString(),
        type:
          typeof existing.type === "string" ? existing.type : "project",
      }
    } else {
      record = {
        ...clientRecord,
        createdAt: new Date().toISOString(),
        type: "project",
      }
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)
    const method = rkey
      ? "app.certified.group.repo.putRecord"
      : "app.certified.group.repo.createRecord"
    const requestBody = rkey
      ? {
          repo: groupDid,
          collection: PROJECT_COLLECTION,
          rkey,
          record,
          ...(swapRecord ? { swapRecord } : {}),
        }
      : {
          repo: groupDid,
          collection: PROJECT_COLLECTION,
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
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
