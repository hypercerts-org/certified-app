/**
 * Dev-only preview fixtures — groups, workspace, and the per-DID
 * indexer connections used across profile + workspace.
 *
 * Covers the remaining indexer operations and the PDS reads that the
 * composed surfaces need:
 *
 *   - `NetworkActors`        → workspace actor switcher list.
 *   - `ActorWorkspaceCounts` → per-actor lexicon count headers.
 *   - `Followers`            → profile Followers tab.
 *   - `ReceivedEndorsements` → profile Endorsements tab.
 *   - `UserProjects`         → profile Projects tab.
 *   - `EvaluatorEndorsements`→ home feed "trusted evaluators" expansion.
 *   - PDS `listRecords(app.certified.graph.follow)` → the follow union
 *     that seeds `FollowerEvents` (the feed's `authors` arg).
 *   - `/api/groups/memberships` → empty list (keeps the OrgProvider on
 *     the personal identity so `isOwnProfile` stays true).
 *
 * "Groups" here is deliberately empty: the preview viewer belongs to no
 * groups, so the org switcher stays on the personal account and every
 * own-vs-foreign gate resolves to own.
 */

import { MOCK_ACTORS, actorByDid } from "./authors"
import { MOCK_DID } from "./session"

/** ---- workspace: NetworkActors ------------------------------------- */

export function networkActorsConnection(): {
  totalCount: number
  edges: {
    cursor: string
    node: {
      uri: string
      did: string
      displayName: string
      description: string
      createdAt: string
      avatar: null
    }
  }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  const edges = MOCK_ACTORS.map((actor, i) => ({
    cursor: `actor-${i}`,
    node: {
      uri: `at://${actor.did}/app.certified.actor.profile/self`,
      did: actor.did,
      displayName: actor.displayName,
      description: actor.description,
      createdAt: actor.createdAt,
      avatar: null,
    },
  }))
  return {
    totalCount: edges.length,
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}

/** ---- workspace: ActorWorkspaceCounts ------------------------------ */

/** Aliased connections — each returns just `{ totalCount }`. Keyed to
 *  the requested DID so the viewer's own counts look populated. */
export function actorWorkspaceCounts(did: string): Record<
  string,
  { totalCount: number }
> {
  const isViewer = did === MOCK_DID
  return {
    certs: { totalCount: isViewer ? 6 : 3 },
    projects: { totalCount: isViewer ? 2 : 1 },
    lists: { totalCount: isViewer ? 1 : 0 },
    endorsementsReceived: { totalCount: isViewer ? 4 : 2 },
    followers: { totalCount: isViewer ? 12 : 5 },
  }
}

/** ---- profile: Followers ------------------------------------------- */

export function followersConnection(did: string): {
  totalCount: number
  edges: { node: { uri: string; cid: string; did: string; createdAt: string } }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  // Everyone except the subject follows the subject.
  const followers = MOCK_ACTORS.filter((a) => a.did !== did)
  const edges = followers.map((a, i) => ({
    node: {
      uri: `at://${a.did}/app.certified.graph.follow/f${i}`,
      cid: `bafyfollow${i}00000000000000000000000000000000000000000000000`,
      did: a.did,
      createdAt: a.createdAt,
    },
  }))
  return {
    totalCount: edges.length,
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}

/** ---- profile: ReceivedEndorsements -------------------------------- */

export function receivedEndorsementsConnection(did: string): {
  edges: { node: Record<string, unknown> }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  const issuers = MOCK_ACTORS.filter((a) => a.did !== did).slice(0, 2)
  const edges = issuers.map((issuer, i) => ({
    node: {
      uri: `at://${issuer.did}/app.certified.badge.award/e${i}`,
      cid: `bafyendorse${i}0000000000000000000000000000000000000000000000`,
      did: issuer.did,
      createdAt: issuer.createdAt,
      note: "Independently verified the underlying restoration work.",
      badge: `at://${issuer.did}/app.certified.badge.definition/self`,
      issuer: {
        did: issuer.did,
        handle: issuer.handle,
        displayName: issuer.displayName,
        description: issuer.description,
        avatarCid: issuer.avatarCid,
        pds: null,
      },
      response: { state: "accepted", weight: null, createdAt: issuer.createdAt },
    },
  }))
  return {
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}

/** ---- profile: UserProjects ---------------------------------------- */

export function userProjectsConnection(did: string): {
  totalCount: number
  edges: { cursor: string; node: Record<string, unknown> }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  const actor = actorByDid(did)
  const titles = [
    "Estuary restoration portfolio",
    "Open drawdown measurement toolkit",
  ]
  const edges = titles.map((title, i) => ({
    cursor: `proj-${i}`,
    node: {
      uri: `at://${did}/org.hypercerts.collection/p${i}`,
      cid: `bafyproject${i}0000000000000000000000000000000000000000000000`,
      did,
      createdAt: actor?.createdAt ?? "2024-06-01T00:00:00.000Z",
      title,
      shortDescription:
        "A curated set of verified restoration claims grouped for funders.",
      items: [],
      banner: null,
    },
  }))
  return {
    totalCount: edges.length,
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}

/** ---- home feed: EvaluatorEndorsements ------------------------------ */

/** Empty-but-valid connection. The home feed unions these subject DIDs
 *  into the feed author set; empty keeps the feed scoped to the follow
 *  union, which is enough for a populated screenshot. */
export function evaluatorEndorsementsConnection(): {
  edges: { cursor: string; node: Record<string, unknown> }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  return { edges: [], pageInfo: { hasNextPage: false, endCursor: null } }
}

/** ---- PDS: app.certified.graph.follow listRecords ------------------ */

/** The viewer's "following" set, read from their PDS. Drives the feed's
 *  `authors` filter. Everyone in the directory except the viewer. */
export function followRecords(): {
  records: { uri: string; cid: string; value: Record<string, unknown> }[]
} {
  const subjects = MOCK_ACTORS.filter((a) => a.did !== MOCK_DID)
  return {
    records: subjects.map((a, i) => ({
      uri: `at://${MOCK_DID}/app.certified.graph.follow/follow${i}`,
      cid: `bafyfollowing${i}000000000000000000000000000000000000000000000`,
      value: {
        $type: "app.certified.graph.follow",
        subject: a.did,
        createdAt: a.createdAt,
      },
    })),
  }
}

/** ---- /api/groups/memberships -------------------------------------- */

/** No remote group memberships — keeps the personal identity active. */
export function groupsMembershipsResponse(): {
  groups: never[]
  cursor: null
} {
  return { groups: [], cursor: null }
}
