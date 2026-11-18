/**
 * Dev-only preview fixtures — managed organizations (org-identity
 * read-aggregation).
 *
 * Backs the `?managed=1` preview scenario used to verify the inline
 * "by {group}" aggregation on the Home sidebar and the profile
 * Projects / Activities tabs: the mock session belongs to three groups
 * and the indexer serves the records authored by the ones it OWNS or
 * ADMINS. A group the viewer is only a MEMBER of is intentionally
 * excluded from aggregation — membership alone doesn't fold the group's
 * records in the way owner/admin do.
 *
 * Wiring (all under the managed scenario, gated by the MockFetchProvider
 * `managedScenario` prop so the existing previews are untouched):
 *
 *   - `/api/groups/memberships` → {@link managedGroupsMembershipsResponse}
 *     returns the three managed groups as `RemoteMembership[]` so
 *     `fetchRemoteMemberships` (and therefore `resolveGroups` →
 *     `useOrg().groups`) resolves to them.
 *   - PLC directory + `/api/groups/{groupDid}/profile` → per-group
 *     handle + displayName so the aggregation rows read "by {group}".
 *   - `/api/indexer` `Projects` / `Activities` with an `authors[]` that
 *     includes the owner/admin group DIDs → {@link managedProjectsConnection}
 *     / {@link managedActivitiesConnection}, which return records OWNED
 *     BY those DIDs (personal + owner + admin, NOT the member group) so
 *     the aggregation visibly includes "by {group}" rows.
 *
 * The viewer identity ({@link MOCK_DID}) and record shapes stay
 * consistent with the existing feed / groups fixtures.
 */

import type { RemoteMembership, OrgRole } from "@/lib/groups/types"
import { MOCK_DID } from "./session"
import { MOCK_ACTORS } from "./authors"
import { receivedEndorsementsConnection } from "./groups"

/** One managed group per role. Same `did:plc:` shape as MOCK_DID so
 *  `isValidDid` and the PLC-directory URL builder accept them. The
 *  member group is the aggregation-excluded one. */
export interface ManagedGroupFixture {
  groupDid: string
  handle: string
  displayName: string
  role: OrgRole
  /** Stable join timestamp surfaced on the remote-membership row. */
  joinedAt: string
}

export const MANAGED_OWNER_GROUP_DID = "did:plc:managedowner00000000000000000"
export const MANAGED_ADMIN_GROUP_DID = "did:plc:managedadmin00000000000000000"
export const MANAGED_MEMBER_GROUP_DID = "did:plc:managedmember0000000000000000"

/** The three managed groups. Ordered owner → admin → member. */
export const MANAGED_GROUPS: ManagedGroupFixture[] = [
  {
    groupDid: MANAGED_OWNER_GROUP_DID,
    handle: "estuary-alliance.certified.app",
    displayName: "Estuary Alliance",
    role: "owner",
    joinedAt: "2024-02-01T10:00:00.000Z",
  },
  {
    groupDid: MANAGED_ADMIN_GROUP_DID,
    handle: "drawdown-collective.certified.app",
    displayName: "Drawdown Collective",
    role: "admin",
    joinedAt: "2024-03-12T10:00:00.000Z",
  },
  {
    groupDid: MANAGED_MEMBER_GROUP_DID,
    handle: "watershed-guild.certified.app",
    displayName: "Watershed Guild",
    role: "member",
    joinedAt: "2024-04-20T10:00:00.000Z",
  },
]

/** Lookup by group DID. */
export function managedGroupByDid(
  groupDid: string,
): ManagedGroupFixture | undefined {
  return MANAGED_GROUPS.find((g) => g.groupDid === groupDid)
}

/** The set of DIDs whose records the aggregation SHOULD include: the
 *  viewer plus every group they own or admin. The member group is
 *  deliberately absent. The aggregating surface passes exactly these as
 *  the indexer `authors[]` filter. */
export const MANAGED_AGGREGATED_DIDS: string[] = [
  MOCK_DID,
  ...MANAGED_GROUPS.filter((g) => g.role !== "member").map((g) => g.groupDid),
]

/** True when an `authors[]` request is the managed-aggregation request,
 *  i.e. it carries at least one of the owner/admin group DIDs. Used by
 *  the mock provider to decide whether to serve the managed connections.
 *  The member group on its own does NOT trip this — membership doesn't
 *  aggregate. */
export function isManagedAuthorsRequest(authors: unknown): boolean {
  if (!Array.isArray(authors)) return false
  const aggregating = new Set(
    MANAGED_GROUPS.filter((g) => g.role !== "member").map((g) => g.groupDid),
  )
  return authors.some((a) => typeof a === "string" && aggregating.has(a))
}

/** ---- /api/groups/memberships (CGS shape) -------------------------- */

/** Remote-membership rows for the managed scenario — the
 *  `{ groups: RemoteMembership[]; cursor }` shape `fetchRemoteMemberships`
 *  paginates. All three groups (incl. the member one) are returned: the
 *  member group still shows up in `useOrg().groups`; it's the
 *  aggregation that excludes it, not the membership list. */
export function managedGroupsMembershipsResponse(): {
  groups: RemoteMembership[]
  cursor: null
} {
  return {
    groups: MANAGED_GROUPS.map(
      (g): RemoteMembership => ({
        groupDid: g.groupDid,
        role: g.role,
        joinedAt: g.joinedAt,
      }),
    ),
    cursor: null,
  }
}

/** A `Group[]` for the session user, as `useOrg().groups` resolves it
 *  under the managed scenario (remote memberships merged with the local
 *  accepted records). Exposed for any preview that wants the resolved
 *  groups directly without round-tripping through `resolveGroups`. */
export function managedGroups(): {
  groupDid: string
  handle: string
  displayName: string
  role: OrgRole
  accepted: boolean
}[] {
  return MANAGED_GROUPS.map((g) => ({
    groupDid: g.groupDid,
    handle: g.handle,
    displayName: g.displayName,
    role: g.role,
    accepted: true,
  }))
}

/** ---- /api/groups/{groupDid}/profile ------------------------------- */

/** The org profile record `getOrgProfile` reads (used by `resolveGroups`
 *  to populate `displayName`). Returns null for an unknown DID so the
 *  caller falls back to the handle. */
export function managedOrgProfile(
  groupDid: string,
): { displayName: string; description: string } | null {
  const group = managedGroupByDid(groupDid)
  if (!group) return null
  return {
    displayName: group.displayName,
    description: `Managed group preview — ${group.displayName}.`,
  }
}

/** ---- aggregation source records ----------------------------------- */

/** Per-owner project/activity content. Keyed so the personal viewer and
 *  each aggregated group contribute distinct, recognisable rows. */
interface OwnerContent {
  did: string
  /** Human label used only to keep the fixtures readable. */
  label: string
  projectTitles: string[]
  activityTitles: string[]
}

const OWNER_CONTENT: OwnerContent[] = [
  {
    did: MOCK_DID,
    label: "personal",
    projectTitles: ["Personal restoration portfolio"],
    activityTitles: ["Soil-carbon protocol — personal draft"],
  },
  {
    did: MANAGED_OWNER_GROUP_DID,
    label: "Estuary Alliance",
    projectTitles: [
      "Estuary Alliance — Tagus tidal-marsh program",
      "Estuary Alliance — funder portfolio 2025",
    ],
    activityTitles: ["Tidal-marsh planting — Q1 cohort"],
  },
  {
    did: MANAGED_ADMIN_GROUP_DID,
    label: "Drawdown Collective",
    projectTitles: ["Drawdown Collective — measurement toolkit"],
    activityTitles: [
      "Open drawdown measurement — v3 release",
      "Cover-crop carbon trial — 9 farms",
    ],
  },
]

/** The owner-content entries whose DID appears in `authors`. The member
 *  group never has content here (it isn't in OWNER_CONTENT), so even a
 *  malformed request that smuggled its DID in would yield nothing. */
function ownersInAuthors(authors: string[]): OwnerContent[] {
  const wanted = new Set(authors)
  return OWNER_CONTENT.filter((o) => wanted.has(o.did))
}

/** ---- /api/indexer Projects (managed) ------------------------------ */

/** Projects OWNED BY the requested authors — same `orgHypercertsCollection`
 *  node shape as `userProjectsConnection` in `groups.ts`. Records carry
 *  the owning DID so the aggregating surface can render the "by {group}"
 *  byline from each node's `did`. */
export function managedProjectsConnection(authors: string[]): {
  totalCount: number
  edges: { cursor: string; node: Record<string, unknown> }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  const owners = ownersInAuthors(authors)
  const edges: { cursor: string; node: Record<string, unknown> }[] = []
  owners.forEach((owner) => {
    owner.projectTitles.forEach((title, i) => {
      const idx = edges.length
      edges.push({
        cursor: `managed-proj-${idx}`,
        node: {
          uri: `at://${owner.did}/org.hypercerts.collection/mp${i}`,
          cid: `bafymanagedproj${idx}0000000000000000000000000000000000000`,
          did: owner.did,
          createdAt: "2025-01-10T09:00:00.000Z",
          title,
          shortDescription:
            "A verified restoration portfolio surfaced through org aggregation.",
          items: [],
          banner: null,
        },
      })
    })
  })
  return {
    totalCount: edges.length,
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}

/** ---- /api/indexer Activities (managed) ---------------------------- */

/** Activities OWNED BY the requested authors — same
 *  `orgHypercertsClaimActivity` node shape as `activitiesConnection` in
 *  `feed.ts`. Each node's `did` is the owning DID so the surface renders
 *  the "by {group}" attribution. */
export function managedActivitiesConnection(authors: string[]): {
  totalCount: number
  edges: { cursor: string; node: Record<string, unknown> }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  const owners = ownersInAuthors(authors)
  const edges: { cursor: string; node: Record<string, unknown> }[] = []
  owners.forEach((owner) => {
    owner.activityTitles.forEach((title, i) => {
      const idx = edges.length
      edges.push({
        cursor: `managed-act-${idx}`,
        node: {
          uri: `at://${owner.did}/org.hypercerts.claim.activity/ma${i}`,
          cid: `bafymanagedact${idx}00000000000000000000000000000000000000`,
          did: owner.did,
          title,
          shortDescription:
            "A verified claim surfaced through org read-aggregation.",
          createdAt: "2025-01-12T09:00:00.000Z",
          startDate: null,
          endDate: null,
          labels: [],
          image: null,
          workScope: { scope: "ecological-restoration" },
        },
      })
    })
  })
  return {
    totalCount: edges.length,
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}

/** ---- PLC DID document (managed groups) ---------------------------- */

/** A minimal PLC DID document for one managed group DID, so the
 *  `https://plc.directory/<groupDid>` fetch that `resolveHandle` makes
 *  yields the group's handle. Returns null for an unknown DID. */
export function managedPlcDidDocument(groupDid: string): {
  id: string
  alsoKnownAs: string[]
  service: { id: string; type: string; serviceEndpoint: string }[]
} | null {
  const group = managedGroupByDid(groupDid)
  if (!group) return null
  return {
    id: group.groupDid,
    alsoKnownAs: [`at://${group.handle}`],
    service: [
      {
        id: "#atproto_pds",
        type: "AtprotoPersonalDataServer",
        serviceEndpoint: "https://preview-pds.certified.app",
      },
    ],
  }
}

/** ---- a group's own social graph (Workspace → Endorsements, Followers) */

type RepoRecord = { uri: string; cid: string; value: Record<string, unknown> }

/** The accounts a managed group follows and endorses: the directory
 *  after the viewer and the first issuer, so its lists differ from yours. */
function groupSubjects(): typeof MOCK_ACTORS {
  return MOCK_ACTORS.slice(2)
}

/**
 * `listRecords` on a managed group's repo, for the collections the
 * Workspace's Endorsements and Followers read acting as the group: its
 * follows, its endorsement definition and awards (Given), one endorsement
 * list, and its responses (one received endorsement hidden). Null for any
 * other repo or collection, so every other preview is unchanged.
 */
export function managedGroupRepoRecords(
  repo: string,
  collection: string,
): { records: RepoRecord[] } | null {
  if (!managedGroupByDid(repo)) return null
  const subjects = groupSubjects()
  const defUri = `at://${repo}/app.certified.badge.definition/endorsement`
  const defCid = "bafygroupdef000000000000000000000000000000000000000000000"
  const awards: RepoRecord[] = subjects.slice(0, 2).map((a, i) => ({
    uri: `at://${repo}/app.certified.badge.award/given${i}`,
    cid: `bafygroupaward${i}00000000000000000000000000000000000000000000`,
    value: {
      $type: "app.certified.badge.award",
      badge: { uri: defUri, cid: defCid },
      subject: { $type: "app.certified.defs#did", did: a.did },
      note: i === 0 ? "Partnered with us on two estuary surveys." : undefined,
      createdAt: `2025-0${i + 3}-14T10:00:00.000Z`,
    },
  }))
  switch (collection) {
    case "app.certified.graph.follow":
      return {
        records: subjects.map((a, i) => ({
          uri: `at://${repo}/app.certified.graph.follow/groupfollow${i}`,
          cid: `bafygroupfollow${i}0000000000000000000000000000000000000000000`,
          value: { $type: "app.certified.graph.follow", subject: a.did, createdAt: a.createdAt },
        })),
      }
    case "app.certified.badge.definition":
      return {
        records: [
          {
            uri: defUri,
            cid: defCid,
            value: {
              $type: "app.certified.badge.definition",
              badgeType: "endorsement",
              title: "Endorsement",
              createdAt: "2025-01-10T10:00:00.000Z",
            },
          },
        ],
      }
    case "app.certified.badge.award":
      return { records: awards }
    case "app.certified.badge.response": {
      // The group hid the second endorsement it received.
      const hidden = receivedEndorsementsConnection(repo).edges[1]?.node
      if (!hidden) return { records: [] }
      return {
        records: [
          {
            uri: `at://${repo}/app.certified.badge.response/hidden0`,
            cid: "bafygroupresponse0000000000000000000000000000000000000000",
            value: {
              $type: "app.certified.badge.response",
              badgeAward: { uri: hidden.uri, cid: hidden.cid },
              response: "rejected",
              createdAt: "2025-05-01T10:00:00.000Z",
            },
          },
        ],
      }
    }
    case "org.hypercerts.collection":
      return {
        records: [
          {
            uri: `at://${repo}/org.hypercerts.collection/partnerslist`,
            cid: "bafygrouplist00000000000000000000000000000000000000000000",
            value: {
              $type: "org.hypercerts.collection",
              type: "list:endorsements",
              title: "Survey partners",
              description: "Organizations we run estuary surveys with.",
              createdAt: "2025-04-02T10:00:00.000Z",
              items: [{ itemIdentifier: { uri: awards[0].uri, cid: awards[0].cid } }],
            },
          },
        ],
      }
    default:
      return null
  }
}

/** Accepting stand-ins for the group write routes the Workspace's
 *  Endorsements and Followers call acting as a group, so the preview can
 *  be clicked through without reaching a server. Nothing is stored. */
export function managedGroupWriteResponse(
  path: string,
  method: string,
): Record<string, unknown> | null {
  const match = /^\/api\/groups\/([^/]+)\/(follow|endorse|response|endorsement-definition)$/.exec(path)
  if (!match || (method !== "POST" && method !== "DELETE")) return null
  const groupDid = decodeURIComponent(match[1])
  if (!managedGroupByDid(groupDid)) return null
  if (method === "DELETE") return { ok: true }
  const collection =
    match[2] === "follow"
      ? "app.certified.graph.follow"
      : match[2] === "response"
        ? "app.certified.badge.response"
        : match[2] === "endorse"
          ? "app.certified.badge.award"
          : "app.certified.badge.definition"
  const rkey = `preview${Date.now()}`
  return { uri: `at://${groupDid}/${collection}/${rkey}`, cid: `bafypreviewwrite${rkey}` }
}
