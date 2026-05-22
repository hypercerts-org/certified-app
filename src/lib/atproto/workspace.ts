import { getBlobRefLink } from "@/lib/atproto/types"

const INDEXER_PROXY_URL = "/api/indexer"

// --------------------------- Actors -----------------------------------

export interface NetworkActor {
  did: string
  displayName: string | null
  description: string | null
  /** Resolved through the local xrpc proxy — null when the actor has
   *  no avatar set. */
  avatarUrl: string | null
}

interface NetworkActorsGraphQLResponse {
  data?: {
    appCertifiedActorProfile?: {
      totalCount: number | null
      edges: {
        cursor: string
        node: {
          did: string
          displayName: string | null
          description: string | null
          avatar:
            | { __typename: "OrgHypercertsDefsUri"; uri?: string | null }
            | {
                __typename: "OrgHypercertsDefsSmallImage"
                image?: { ref?: string | null; mimeType?: string | null } | null
              }
            | null
        } | null
      }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string }[]
}

function avatarUrlFromUnion(
  did: string,
  avatar:
    | { __typename: string; uri?: string | null; image?: { ref?: string | null } | null }
    | null,
): string | null {
  if (!avatar) return null
  if (avatar.__typename === "OrgHypercertsDefsUri") {
    return typeof avatar.uri === "string" ? avatar.uri : null
  }
  if (avatar.__typename === "OrgHypercertsDefsSmallImage") {
    const ref = avatar.image?.ref
    if (!ref) return null
    const cid = getBlobRefLink(ref)
    if (!cid || !/^[A-Za-z0-9]+$/.test(cid)) return null
    return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
  }
  return null
}

export async function fetchNetworkActors(
  first = 30,
  signal?: AbortSignal,
): Promise<NetworkActor[]> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "NetworkActors",
      variables: { first, after: null },
    }),
    signal,
  })
  const json = (await res.json()) as NetworkActorsGraphQLResponse
  const edges = json.data?.appCertifiedActorProfile?.edges ?? []
  const actors: NetworkActor[] = []
  for (const edge of edges) {
    if (!edge.node) continue
    const n = edge.node
    actors.push({
      did: n.did,
      displayName: n.displayName,
      description: n.description,
      avatarUrl: avatarUrlFromUnion(n.did, n.avatar),
    })
  }
  return actors
}

// --------------------------- Workspace counts ---------------------------

export type WorkspaceLexicon =
  | "certs"
  | "projects"
  | "lists"
  | "endorsementsReceived"
  | "followers"

export const WORKSPACE_LEXICON_LABEL: Record<WorkspaceLexicon, string> = {
  certs: "Certs",
  projects: "Projects",
  lists: "Lists",
  endorsementsReceived: "Endorsements",
  followers: "Followers",
}

export type WorkspaceCounts = Record<WorkspaceLexicon, number | null>

const EMPTY_COUNTS: WorkspaceCounts = {
  certs: null,
  projects: null,
  lists: null,
  endorsementsReceived: null,
  followers: null,
}

interface CountsGraphQLResponse {
  data?: Partial<
    Record<WorkspaceLexicon, { totalCount: number | null } | null>
  > | null
  errors?: { message: string }[]
}

export async function fetchActorWorkspaceCounts(
  did: string,
  signal?: AbortSignal,
): Promise<WorkspaceCounts> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "ActorWorkspaceCounts",
      variables: { did },
    }),
    signal,
  })
  const json = (await res.json()) as CountsGraphQLResponse
  if (!json.data) return EMPTY_COUNTS

  const out: WorkspaceCounts = { ...EMPTY_COUNTS }
  for (const key of Object.keys(out) as WorkspaceLexicon[]) {
    const node = json.data[key]
    out[key] = typeof node?.totalCount === "number" ? node.totalCount : null
  }
  return out
}
