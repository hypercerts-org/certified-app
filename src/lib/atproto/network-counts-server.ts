import type { NetworkCounts } from "./indexer"
import {
  DEFAULT_HIDDEN_CERT_LABELS,
  DEFAULT_HIDDEN_ORG_LABELS,
} from "./labels"

/**
 * Server-side fetch of the network-wide counts shown on the /welcome
 * stats strip. Runs during the RSC render of the ISR'd landing page
 * (revalidate hourly), so the five upstream GraphQL queries execute
 * ~once per hour globally instead of once per anonymous visitor via
 * the /api/indexer proxy (which is same-origin and therefore
 * unreachable from an RSC anyway — its CSRF check fail-closes on
 * missing Origin).
 *
 * The query strings duplicate the ProfileCount / OrganizationCount /
 * ActivityCount / ProjectCount / AwardCount operations in
 * src/app/api/indexer/route.ts, including the label-exclusion policy
 * (shared via labels.ts). Keep the two in sync when count semantics
 * change.
 *
 * Fail-soft contract, mirroring the client's fetchNetworkCounts:
 * never throws; any per-query failure (HTTP !ok, GraphQL errors,
 * timeout, unexpected shape) yields `null` for that field, and a
 * missing upstream URL yields all-null without fetching. Render
 * sites treat `null` as "no server value" and fall back to the
 * client fetch.
 */

// Per-query upstream budget. The landing render must never hang on a
// slow indexer; past this the field degrades to null and the client
// fallback takes over.
const UPSTREAM_TIMEOUT_MS = 5_000

const EMPTY: NetworkCounts = {
  users: null,
  organizations: null,
  achievements: null,
  projects: null,
  endorsements: null,
}

// Each query asks for a single page (first: 1) just to surface
// `totalCount`; the edge is discarded. Selection keeps the
// `totalCount + edges + pageInfo` shape because some GraphQL schemas
// reject a bare-aggregate selection on a connection root.
const COUNT_QUERIES: {
  key: keyof NetworkCounts
  op: string
  root: string
  query: string
}[] = [
  {
    key: "users",
    op: "ProfileCount",
    root: "appCertifiedActorProfile",
    query: `
    query ProfileCount {
      appCertifiedActorProfile(
        first: 1
        excludeAuthorLabels: ${JSON.stringify([...DEFAULT_HIDDEN_ORG_LABELS])}
      ) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,
  },
  {
    key: "organizations",
    op: "OrganizationCount",
    root: "appCertifiedActorOrganization",
    query: `
    query OrganizationCount {
      appCertifiedActorOrganization(
        first: 1
        excludeLabels: ${JSON.stringify([...DEFAULT_HIDDEN_ORG_LABELS])}
      ) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,
  },
  {
    key: "achievements",
    op: "ActivityCount",
    root: "orgHypercertsClaimActivity",
    query: `
    query ActivityCount {
      orgHypercertsClaimActivity(
        first: 1
        excludeLabels: ${JSON.stringify([...DEFAULT_HIDDEN_CERT_LABELS])}
        excludeAuthorLabels: ${JSON.stringify([...DEFAULT_HIDDEN_ORG_LABELS])}
      ) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,
  },
  {
    key: "projects",
    op: "ProjectCount",
    root: "orgHypercertsCollection",
    query: `
    query ProjectCount {
      orgHypercertsCollection(
        first: 1
        where: { type: { eqi: "project" } }
        excludeAuthorLabels: ${JSON.stringify([...DEFAULT_HIDDEN_ORG_LABELS])}
      ) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,
  },
  {
    key: "endorsements",
    op: "AwardCount",
    root: "appCertifiedBadgeAward",
    query: `
    query AwardCount {
      appCertifiedBadgeAward(
        first: 1
        excludeAuthorLabels: ${JSON.stringify([...DEFAULT_HIDDEN_ORG_LABELS])}
      ) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,
  },
]

async function fetchCountUpstream(
  url: string,
  op: string,
  root: string,
  query: string,
): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: {}, operationName: op }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: Record<string, { totalCount?: number | null } | null>
      errors?: { message?: string }[]
    }
    if (json.errors && json.errors.length > 0) return null
    const total = json.data?.[root]?.totalCount
    return typeof total === "number" ? total : null
  } catch {
    return null
  }
}

/**
 * Fetch every network-wide count in parallel, straight against the
 * upstream indexer. Returns all-null (no fetches) when no upstream
 * URL is configured — the client-side fallback still works there
 * because the /api/indexer proxy carries its own default endpoint.
 */
export async function fetchNetworkCountsServer(): Promise<NetworkCounts> {
  // Read at call time (not module load) so tests and per-env
  // configuration behave predictably.
  const url =
    process.env.INDEXER_URL || process.env.NEXT_PUBLIC_INDEXER_URL || null
  if (!url) return { ...EMPTY }

  const entries = await Promise.all(
    COUNT_QUERIES.map(({ key, op, root, query }) =>
      fetchCountUpstream(url, op, root, query).then(
        (count) => [key, count] as const,
      ),
    ),
  )
  const out: NetworkCounts = { ...EMPTY }
  for (const [key, count] of entries) {
    out[key] = count
  }
  return out
}
