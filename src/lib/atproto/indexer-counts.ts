import { INDEXER_PROXY_URL, postIndexer } from "./indexer-client"

// ============================================================================
// Network counts (for the /welcome landing-page stats strip)
// ============================================================================

export interface NetworkCounts {
  /** `app.certified.actor.profile` total — "Users". */
  users: number | null
  /** `app.certified.actor.organization` total — "Organizations". */
  organizations: number | null
  /** `org.hypercerts.claim.activity` total — labelled "Achievements"
   *  on the public landing page to avoid in-app jargon. */
  achievements: number | null
  /** `org.hypercerts.collection` records with `type == "project"`. */
  projects: number | null
  /** `app.certified.badge.award` total — "Endorsements".
   *  Includes both default endorsements and list-typed ones. */
  endorsements: number | null
}

const COUNT_OPERATIONS = [
  { key: "users", op: "ProfileCount", root: "appCertifiedActorProfile" },
  {
    key: "organizations",
    op: "OrganizationCount",
    root: "appCertifiedActorOrganization",
  },
  {
    key: "achievements",
    op: "ActivityCount",
    root: "orgHypercertsClaimActivity",
  },
  { key: "projects", op: "ProjectCount", root: "orgHypercertsCollection" },
  { key: "endorsements", op: "AwardCount", root: "appCertifiedBadgeAward" },
] as const

/**
 * Exact deduped count of the activities a profile CREATED or
 * CONTRIBUTED to (the union, via the indexer's `_or` filter — see the
 * `UserActivityCount` op). One cheap `first: 1` query that reads only
 * `totalCount`. Returns null on any failure so callers fall back
 * gracefully instead of rendering a wrong number.
 */
export async function fetchUserActivityCount(
  did: string,
): Promise<number | null> {
  if (!did) return null
  try {
    const res = await postIndexer<{
      orgHypercertsClaimActivity?: { totalCount?: number | null } | null
    }>("UserActivityCount", { did })
    if (!res.ok) return null
    if (res.errors.length > 0) return null
    const total = res.data?.orgHypercertsClaimActivity?.totalCount
    return typeof total === "number" ? total : null
  } catch {
    return null
  }
}

/**
 * Fetch one zero-variable count via the proxy's edge-cacheable GET
 * variant (`GET /api/indexer?op=<name>` — see `CACHEABLE_OPS` in
 * `src/app/api/indexer/route.ts`). The response body is identical to
 * the POST form, but GETs are cacheable at the Vercel edge, so the
 * five /welcome counts stop invoking the function once per visitor.
 */
async function fetchCount(op: string, root: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${INDEXER_PROXY_URL}?op=${encodeURIComponent(op)}`,
    )
    if (!res.ok) {
      if (process.env.NODE_ENV !== "production") {
        const body = await res.text().catch(() => "")
        console.warn(
          `[network-counts] ${op} -> HTTP ${res.status}`,
          body.slice(0, 200),
        )
      }
      return null
    }
    const json = (await res.json()) as {
      data?: Record<string, { totalCount?: number | null } | null>
      errors?: { message?: string }[]
    }
    if (json.errors && json.errors.length > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[network-counts] ${op} -> GraphQL errors`,
          json.errors.map((e) => e.message).join(" | "),
        )
      }
      return null
    }
    const node = json.data?.[root]
    const total = node?.totalCount
    if (typeof total !== "number") {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[network-counts] ${op} -> unexpected response shape`,
          { root, node },
        )
      }
      return null
    }
    return total
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[network-counts] ${op} -> exception`, err)
    }
    return null
  }
}

/**
 * Fetch every network-wide count in parallel. Each pair is
 * independent — a transient failure on one (e.g. the
 * `app.certified.actor.organization` collection not yet indexed)
 * yields `null` for that field; the rest still resolve. Render
 * sites should treat `null` as "-" (data unavailable) rather than
 * "0".
 */
export async function fetchNetworkCounts(): Promise<NetworkCounts> {
  const entries = await Promise.all(
    COUNT_OPERATIONS.map(({ key, op, root }) =>
      fetchCount(op, root).then((count) => [key, count] as const),
    ),
  )
  const out: NetworkCounts = {
    users: null,
    organizations: null,
    achievements: null,
    projects: null,
    endorsements: null,
  }
  for (const [key, count] of entries) {
    out[key] = count
  }
  return out
}
