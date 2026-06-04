/**
 * Dev-only preview fixtures — managed organizations (org-identity
 * read-aggregation + per-action write model).
 *
 * Backs a FUTURE managed / "write-as-org" preview surface that
 * aggregates the viewer's PERSONAL records together with the records
 * authored by the groups they OWN or ADMIN. A group the viewer is only
 * a MEMBER of is intentionally excluded from aggregation — membership
 * alone doesn't grant the read-aggregation that owner/admin do.
 *
 * Wiring (all under the managed scenario, gated by the MockFetchProvider
 * `managedScenario` prop so the existing previews are untouched):
 *
 *   - `/api/groups/memberships` → {@link managedGroupsMembershipsResponse}
 *     returns the three managed groups as `RemoteMembership[]` so
 *     `fetchRemoteMemberships` (and therefore `resolveGroups` →
 *     `useOrg().groups`) resolves to them.
 *   - PDS `listRecords(app.certified.actor.membership)` → the matching
 *     local membership records (see `managedMembershipRecords`) so
 *     `resolveGroups` marks each group `accepted: true`.
 *   - PLC directory + `/api/groups/{groupDid}/profile` → per-group
 *     handle + displayName so the aggregation rows read "via {group}".
 *   - `/api/indexer` `Projects` / `Activities` with an `authors[]` that
 *     includes the owner/admin group DIDs → {@link managedProjectsConnection}
 *     / {@link managedActivitiesConnection}, which return records OWNED
 *     BY those DIDs (personal + owner + admin, NOT the member group) so
 *     the aggregation visibly includes "via {group}" rows.
 *
 * The viewer identity ({@link MOCK_DID}) and record shapes stay
 * consistent with the existing feed / groups fixtures.
 */

import type { RemoteMembership, OrgRole, MembershipRecord } from "@/lib/groups/types"
import { MOCK_DID } from "./session"

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

/** ---- PDS listRecords(app.certified.actor.membership) -------------- */

/** Local membership records on the viewer's PDS — one per managed group,
 *  so `resolveGroups` marks each `accepted: true`. Shape matches what
 *  `listMemberships` reads (`{ records: [{ uri, cid, value }] }`). */
export function managedMembershipRecords(): {
  records: { uri: string; cid: string; value: MembershipRecord }[]
} {
  return {
    records: MANAGED_GROUPS.map((g, i) => ({
      uri: `at://${MOCK_DID}/app.certified.actor.membership/membership${i}`,
      cid: `bafymembership${i}00000000000000000000000000000000000000000000`,
      value: {
        $type: "app.certified.actor.membership",
        groupDid: g.groupDid,
        role: g.role,
        joinedAt: g.joinedAt,
      },
    })),
  }
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
 *  the owning DID so the aggregating surface can render the "via {group}"
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
 *  the "via {group}" attribution. */
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

/** ---- /api/notifications (managed aggregation) --------------------- */

/** Per-recipient notification content — the identity each notification is
 *  FOR (the viewer or a group they own/admin), the reason, and who
 *  triggered it. The member group never appears (it isn't a recipient the
 *  aggregation authorizes). */
interface RecipientNotice {
  recipient: string
  reason: "endorsement" | "activity-contributor"
  /** Display handle of the actor who triggered the notice (latestAuthor). */
  actorDid: string
  sortAt: string
  count: number
}

const RECIPIENT_NOTICES: RecipientNotice[] = [
  {
    recipient: MOCK_DID,
    reason: "endorsement",
    actorDid: "did:plc:noticeactor0000000000000000001",
    sortAt: "2026-05-20T14:10:00.000Z",
    count: 1,
  },
  {
    recipient: MANAGED_OWNER_GROUP_DID,
    reason: "endorsement",
    actorDid: "did:plc:noticeactor0000000000000000002",
    sortAt: "2026-05-20T11:40:00.000Z",
    count: 3,
  },
  {
    recipient: MANAGED_OWNER_GROUP_DID,
    reason: "activity-contributor",
    actorDid: "did:plc:noticeactor0000000000000000003",
    sortAt: "2026-05-19T16:05:00.000Z",
    count: 1,
  },
  {
    recipient: MANAGED_ADMIN_GROUP_DID,
    reason: "endorsement",
    actorDid: "did:plc:noticeactor0000000000000000004",
    sortAt: "2026-05-19T09:25:00.000Z",
    count: 2,
  },
]

/** The notices whose recipient is in the requested `recipients` set. A
 *  request with no recipients (personal path) yields only the viewer's. */
function noticesForRecipients(recipients: string[] | null): RecipientNotice[] {
  const wanted = new Set(recipients && recipients.length > 0 ? recipients : [MOCK_DID])
  return RECIPIENT_NOTICES.filter((n) => wanted.has(n.recipient))
}

/** Notifications connection for the managed aggregation — the
 *  `{ edges, pageInfo }` shape the notifications proxy forwards, each node
 *  carrying the new `recipient` field so the client tags "via {group}". */
export function managedNotificationsConnection(recipients: string[] | null): {
  edges: { cursor: string; node: Record<string, unknown> }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  const notices = noticesForRecipients(recipients)
  const edges = notices.map((n, i) => ({
    cursor: `managed-notif-${i}`,
    node: {
      id: `managed-notif-${i}`,
      reason: n.reason,
      reasonSubject: `at://${n.recipient}/org.hypercerts.claim.activity/ma0`,
      sortAt: n.sortAt,
      count: n.count,
      latestRecordUri: `at://${n.actorDid}/app.certified.badge.award/award${i}`,
      latestRecordCid: `bafymanagednotif${i}000000000000000000000000000000000000`,
      latestAuthor: n.actorDid,
      isRead: false,
      recipient: n.recipient,
    },
  }))
  return { edges, pageInfo: { hasNextPage: false, endCursor: null } }
}

/** Aggregated unread count for the managed scenario — the sum of notice
 *  `count`s across the requested recipients. */
export function managedUnreadCount(recipients: string[] | null): {
  count: number
  more: boolean
} {
  const total = noticesForRecipients(recipients).reduce((sum, n) => sum + n.count, 0)
  return { count: total, more: false }
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
