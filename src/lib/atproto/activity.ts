import { authFetch } from "@/lib/auth/fetch"
import { formatShortDate } from "@/lib/utils/format-date"
import { getBlobRefLink } from "./types"
import type { HypercertsUri, HypercertsSmallImage } from "./types"
import type { ListActivitiesResponse } from "./activity-types"

const COLLECTION = "org.hypercerts.claim.activity"

/**
 * Fetch activity records for a given DID with cursor-based pagination.
 */
export async function fetchActivities(
  did: string,
  cursor?: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<ListActivitiesResponse> {
  const params = new URLSearchParams({
    repo: did,
    collection: COLLECTION,
    limit: String(limit),
    reverse: "true",
  })
  if (cursor) params.set("cursor", cursor)

  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    signal ? { signal } : undefined,
  )

  if (!res.ok) {
    if (res.status === 400 || res.status === 404) {
      return { records: [] }
    }
    throw new Error(`Failed to fetch activities: ${res.status}`)
  }

  const data = await res.json()
  return {
    records: data.records ?? [],
    cursor: data.cursor,
  }
}

/**
 * Resolve the image union to a displayable URL.
 *
 * The lexicon schema says `image` is a `HypercertsUri | HypercertsSmallImage`
 * object, but in practice some records in the wild store it as a plain
 * string — most commonly a `data:` URI or an external URL. Those records
 * used to crash anything visiting the author's profile because the
 * tagged-union narrowing below (`"uri" in image`) throws a TypeError
 * when the right-hand operand of `in` is a primitive.
 *
 * We now widen the input type and early-return the raw string for any
 * non-object input. That lets the browser use data URIs and external
 * URLs as `<img src>` directly. Null/undefined/unexpected shapes fall
 * through to `null`.
 *
 * Blob refs go through our own XRPC proxy (not directly to a PDS) so
 * foreign DIDs resolve via `resolvePdsUrl` on the server. A direct
 * fetch to a raw PDS URL would only work for users on the same PDS
 * as the session user.
 */
export function resolveActivityImageUrl(
  image: HypercertsUri | HypercertsSmallImage | string | null | undefined,
  did: string,
): string | null {
  if (image == null) return null
  // Non-conforming records store `image` as a plain string (data: URI
  // or external URL). Return it as-is so the browser can render it.
  if (typeof image === "string") return image
  // Defensive: anything that isn't an object at this point is unusable.
  if (typeof image !== "object") return null

  if ("uri" in image && image.uri) {
    return image.uri
  }
  if ("image" in image && image.image?.ref) {
    const cid = getBlobRefLink(image.image.ref)
    return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
  }
  // Bare blob ref: { ref: { $link: "..." }, $type: "blob" }
  if ("ref" in image && image.ref) {
    const cid = getBlobRefLink(image.ref)
    return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
  }
  return null
}

/**
 * Normalize the polymorphic `workScope` field into a short displayable
 * label, or null if there's nothing to show.
 *
 * The field can be:
 *   - a plain string (older records)          → return the string
 *   - { scope: "..." }                         → return scope
 *   - { expression: "..." } (CEL variant)     → return expression
 *   - null / undefined / something weird       → null
 *
 * Using `'scope' in value` on a raw string throws a TypeError, which is
 * what crashed the profile page for a user whose record stored
 * `workScope` as a string.
 */
export function workScopeToLabel(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") return value
  if (typeof value !== "object") return null
  const obj = value as Record<string, unknown>
  if (typeof obj.scope === "string") return obj.scope
  if (typeof obj.expression === "string") return obj.expression
  return null
}

/**
 * Best-effort evaluator for the `workScope` CEL expression.
 *
 * The lexicon allows three shapes:
 *   - plain string                                  → return as-is
 *   - `#workScopeString` { scope: "…" }             → return scope
 *   - `#workScopeCel`    { expression: "…" }        → evaluate below
 *
 * For CEL we only understand a single common idiom today:
 *
 *   scope.hasAny(["technology", "policy", …])
 *
 * Returned as a comma-separated label `technology, policy`.
 *
 * Anything more complex (logical operators, nested calls, `hasAll`,
 * arithmetic) falls back to the raw expression so the UI still shows
 * the user something. We deliberately avoid pulling in a full CEL
 * parser — the bundle cost outweighs the value when only one shape
 * is in production use. When more shapes appear, extend the regex
 * matchers below rather than reaching for a parser library.
 */
export function evaluateWorkScope(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") return tryEvalCelHasAny(value) ?? value
  if (typeof value !== "object") return null

  const obj = value as Record<string, unknown>
  if (typeof obj.scope === "string") return obj.scope

  if (typeof obj.expression === "string") {
    const evaluated = tryEvalCelHasAny(obj.expression)
    return evaluated ?? obj.expression
  }

  return null
}

/** Match `scope.hasAny([...])` and return the inner array as a label. */
function tryEvalCelHasAny(expression: string): string | null {
  // Single regex match — `s` flag allows multi-line CEL expressions
  // (rare but possible). We grab the bracketed argument list and then
  // split it into individual quoted strings.
  const m = expression.match(/scope\s*\.\s*hasAny\s*\(\s*\[(.*?)\]\s*\)/s)
  if (!m) return null

  const items: string[] = []
  // Match single- or double-quoted strings, supporting escapes.
  const itemRe = /(["'])((?:\\.|(?!\1).)*)\1/g
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(m[1])) !== null) {
    items.push(match[2].replace(/\\(["'\\])/g, "$1"))
  }
  if (items.length === 0) return null
  return items.join(", ")
}

/**
 * Format an ISO date string as a relative time ("2m ago", "5h ago", "3d ago")
 * or an absolute date ("Jan 15, 2026") for dates older than 7 days.
 */
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  if (isNaN(then)) return ""

  const diffMs = Math.max(0, now - then)
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return formatShortDate(isoDate)
}
