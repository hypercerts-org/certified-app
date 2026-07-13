/**
 * Display helpers for the lexicon's contributor shape, shared by the
 * activity and project detail pages. These were byte-identical copies
 * in both components; a single module keeps defensive lexicon-shape
 * parsing (e.g. a new `contributorIdentity` variant) from drifting
 * between the two surfaces.
 */

import type { ActivityContributor } from "@/lib/atproto/activity-types"

/**
 * Stable React key for a contributor row. Contributors carry no id of
 * their own, so we use the strong-ref URI / inline identity plus the
 * position to disambiguate duplicates — avoids the `key={i}` antipattern.
 */
export function contributorKey(
  c: ActivityContributor,
  index: number,
): string {
  const id = c.contributorIdentity as unknown
  if (id && typeof id === "object") {
    const obj = id as Record<string, unknown>
    if (typeof obj.uri === "string") return `${obj.uri}#${index}`
    if (typeof obj.identity === "string") return `${obj.identity}#${index}`
  }
  if (typeof id === "string") return `${id}#${index}`
  return `contributor-${index}`
}

/**
 * Extract role text defensively. The lexicon types this as an object
 * but some records store it as a bare string. `"role" in details`
 * throws when `details` is a primitive, so we type-check at runtime.
 */
export function contributionRoleText(details: unknown): string | null {
  if (typeof details === "string") return details
  if (!details || typeof details !== "object") return null
  const obj = details as Record<string, unknown>
  return typeof obj.role === "string" ? obj.role : null
}

/**
 * Normalise contributor weights to a percent out of 100. The
 * lexicon stores `contributionWeight` as a free-form string so a
 * record can hold values like "1", "0.25", or "high". This helper
 * sums every parseable numeric weight and rewrites each as
 * `round(weight / total * 100)`, returning a map from contributor
 * index to display string. Non-numeric weights are left out of the
 * map; the caller falls back to the raw value so they still
 * render. When no weights parse (or the sum is zero) the returned
 * map is empty — every row falls back to its raw weight.
 */
export function buildWeightPercents(
  contribs: readonly ActivityContributor[],
): Map<number, string> {
  const out = new Map<number, string>()
  const parsed: Array<{ idx: number; n: number }> = []
  let total = 0
  contribs.forEach((c, idx) => {
    const raw = c.contributionWeight?.trim() ?? ""
    if (!raw) return
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n < 0) return
    parsed.push({ idx, n })
    total += n
  })
  if (total <= 0) return out
  for (const { idx, n } of parsed) {
    out.set(idx, `${Math.round((n / total) * 100)}`)
  }
  return out
}
