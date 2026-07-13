import { postIndexer } from "./indexer"

// ----------------------------- Endorsement closure (BFS) ---------------------
//
// Viewer-centric endorsement-graph closure (magic-indexer issue #117).
// Powers the "Endorsed users" filter on /explore by returning every
// DID reachable within `degree` hops of `viewer` through active
// (non-rejected, endorsement-typed) badge awards, plus per-DID
// provenance.

interface EndorsementClosureIssuer {
  did: string
  handle: string | null
  displayName: string | null
  description: string | null
  /** Content-addressed CID of the actor's avatar blob. Client builds
   *  the avatar URL via /api/xrpc/com/atproto/sync/getBlob. */
  avatarCid: string | null
  pds: string | null
}

export interface EndorsementClosureAccount {
  did: string
  degree: 1 | 2 | 3
  /**
   * Degree-(degree − 1) predecessors that endorsed this account, deduped
   * and sorted. Empty array for degree=1 — the viewer is the predecessor
   * but is excluded from the result per spec. The indexer returns these
   * as `via: [String!]!`; we narrow the type here.
   */
  via: string[]
  /**
   * Denormalised actor profile populated server-side via a single bulk
   * lookup on actor(did) (magic-indexer #117 perf follow-up). Always
   * present in responses from the new indexer; legacy / fallback paths
   * (PDS BFS) leave this as `{did}` only.
   */
  issuer: EndorsementClosureIssuer
}

export interface EndorsementClosure {
  accounts: EndorsementClosureAccount[]
  /**
   * True when the closure exceeded the indexer-side cap (default 3000).
   * The in-flight ring is trimmed degrees-furthest-first; lower rings
   * are intact. UI shows a "showing a subset of your trust graph" notice.
   */
  truncated: boolean
}

/** GraphQL `data` payload of the EndorsementClosure op. */
interface EndorsementClosureData {
  endorsementClosure?: {
    accounts: {
      did: string
      degree: number
      via: string[]
      issuer?: {
        did: string
        handle: string | null
        displayName: string | null
        description: string | null
        avatarCid: string | null
        pds: string | null
      } | null
    }[]
    truncated: boolean
  }
}

/**
 * Server-side endorsement-graph closure error surface. The indexer
 * returns structured `extensions.code` SCREAMING_SNAKE_CASE codes so
 * the UI can branch deterministically (warming vs. invalid input vs.
 * disabled feature). Plain `Error` fallback when no code is present
 * (network failure / non-GraphQL error).
 */
export class EndorsementClosureError extends Error {
  /** SCREAMING_SNAKE_CASE per magic-indexer convention. */
  readonly code: string | null
  constructor(message: string, code: string | null) {
    super(message)
    this.name = "EndorsementClosureError"
    this.code = code
  }
}

/**
 * Fetches the viewer's endorsement-graph closure at the given depth.
 *
 *   - `viewer`: viewer DID (excluded from the result).
 *   - `degree`: ∈ {1, 2, 3}. Cumulative: degree=2 returns 1st ∪ 2nd.
 *   - `signal`: optional AbortSignal threaded through to fetch.
 *
 * Throws `EndorsementClosureError` with a structured code on a 4xx-
 * style failure (`INVALID_VIEWER_DID`, `INVALID_DEGREE`,
 * `ENDORSEMENT_GRAPH_WARMING`, `ENDORSEMENT_GRAPH_DISABLED`). Callers
 * (e.g. use-explore) typically downgrade `ENDORSEMENT_GRAPH_WARMING`
 * to a loading state and surface the others to the user.
 */
export async function fetchEndorsementClosure(
  viewer: string,
  degree: 1 | 2 | 3,
  signal?: AbortSignal,
): Promise<EndorsementClosure> {
  const res = await postIndexer<EndorsementClosureData>(
    "EndorsementClosure",
    { viewer, degree },
    { signal },
  )
  if (!res.ok) {
    throw new EndorsementClosureError(
      `Indexer proxy returned ${res.status}`,
      null,
    )
  }
  if (res.errors.length > 0) {
    const first = res.errors[0]
    throw new EndorsementClosureError(
      first.message,
      first.extensions?.code ?? null,
    )
  }
  if (!res.data?.endorsementClosure) {
    throw new EndorsementClosureError(
      "Indexer returned no closure payload",
      null,
    )
  }
  const c = res.data.endorsementClosure
  return {
    truncated: c.truncated,
    // Narrow degree to 1 | 2 | 3. The indexer never returns anything
    // outside that range (it's gated at the resolver), but cast
    // defensively so a future degree-4 doesn't silently slip into
    // consumers that switch on the literal type.
    accounts: c.accounts.map((a) => ({
      did: a.did,
      degree: clampClosureDegree(a.degree),
      via: a.via,
      issuer: a.issuer ?? { did: a.did, handle: null, displayName: null, description: null, avatarCid: null, pds: null },
    })),
  }
}

function clampClosureDegree(d: number): 1 | 2 | 3 {
  if (d === 1) return 1
  if (d === 2) return 2
  return 3
}
