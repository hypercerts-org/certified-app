/**
 * Dev-only preview fixtures — home feed.
 *
 * The home feed fans out through three indexer ops behind `/api/indexer`:
 *
 *   1. `FollowerEvents`  → a page of `{ id, kind, subjectUri, sortAt, actor }`
 *      events authored by the viewer's follow union. (`fetchFollowerEvents`)
 *   2. `HydrateFeedPage` → the headline records for those subject URIs,
 *      bucketed by kind into `activities` / `collections` / `badgeAwards`
 *      / … connections. (`hydrateFeedEvents`)
 *   3. The follow union itself comes from a PDS read —
 *      `listRecords(app.certified.graph.follow)` on the viewer's repo —
 *      NOT the indexer. That fixture lives in `groups.ts` (followRecords).
 *
 * This module builds an internally-consistent set: every event's
 * `subjectUri` has a matching node in the hydrate response, so the feed
 * renders real preview cards rather than fallback rows.
 *
 * Dispatch by `operationName` happens in the MockFetchProvider via
 * {@link indexerResponse}; this file owns the per-op payloads.
 */

import {
  MOCK_ACTORS,
  actorByDid,
  type MockActor,
} from "./authors"
import { MOCK_DID } from "./session"

type FeedKind = "cert.create" | "collection.create" | "endorsement.award"

interface FeedSpec {
  /** Authoring actor DID — must be in MOCK_ACTORS. */
  authorDid: string
  kind: FeedKind
  title: string
  shortDescription: string
  /** For endorsement.award: the DID of the endorsed subject. */
  subjectDid?: string
}

/** Ordered newest-first. Each entry becomes one FollowerEvents edge plus
 *  one matching HydrateFeedPage node. */
const FEED_SPECS: FeedSpec[] = [
  {
    authorDid: "did:plc:author10000000000000000000000",
    kind: "cert.create",
    title: "Mangrove restoration — Tagus estuary, Q1",
    shortDescription:
      "Planted 8,400 propagules across three intertidal zones; survival audited at 91%.",
  },
  {
    authorDid: "did:plc:author20000000000000000000000",
    kind: "endorsement.award",
    title: "Endorsement",
    shortDescription: "",
    subjectDid: "did:plc:author10000000000000000000000",
  },
  {
    authorDid: "did:plc:author30000000000000000000000",
    kind: "collection.create",
    title: "Temperate kelp canopy program",
    shortDescription:
      "A curated portfolio of canopy-restoration sites with shared measurement methodology.",
  },
  {
    authorDid: MOCK_DID,
    kind: "cert.create",
    title: "Soil-carbon measurement protocol v2",
    shortDescription:
      "Open methodology for drawdown verification on regenerative cropland.",
  },
  {
    authorDid: "did:plc:author40000000000000000000000",
    kind: "cert.create",
    title: "Cover-crop trial — 14 farms",
    shortDescription:
      "Season-over-season soil organic carbon deltas published with raw samples.",
  },
]

/** Stable per-index timestamp, newest first (index 0 = most recent). */
function sortAtFor(index: number): string {
  const base = Date.UTC(2026, 4, 20, 12, 0, 0)
  return new Date(base - index * 3_600_000).toISOString()
}

function uriFor(spec: FeedSpec, index: number): string {
  const collection =
    spec.kind === "cert.create"
      ? "org.hypercerts.claim.activity"
      : spec.kind === "collection.create"
        ? "org.hypercerts.collection"
        : "app.certified.badge.award"
  return `at://${spec.authorDid}/${collection}/preview${index}`
}

function feedActorBlock(actor: MockActor) {
  return {
    did: actor.did,
    handle: actor.handle,
    displayName: actor.displayName,
    avatarCid: actor.avatarCid,
  }
}

/** `FollowerEvents` connection payload (the `data.followerEvents` value). */
export function followerEventsConnection(): {
  edges: {
    cursor: string
    node: {
      id: string
      kind: string
      subjectUri: string
      sortAt: string
      actor: ReturnType<typeof feedActorBlock>
    }
  }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  const edges = FEED_SPECS.map((spec, index) => {
    const actor = actorByDid(spec.authorDid) ?? MOCK_ACTORS[0]
    const uri = uriFor(spec, index)
    return {
      cursor: `cursor-${index}`,
      node: {
        id: uri,
        kind: spec.kind,
        subjectUri: uri,
        sortAt: sortAtFor(index),
        actor: feedActorBlock(actor),
      },
    }
  })
  return {
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}

/** `HydrateFeedPage` payload — one connection per kind, keyed by the
 *  same subject URIs the FollowerEvents page emitted. */
export function hydrateFeedPageData(): {
  activities: { edges: { node: Record<string, unknown> }[] }
  collections: { edges: { node: Record<string, unknown> }[] }
  badgeAwards: { edges: { node: Record<string, unknown> }[] }
  evaluations: { edges: { node: Record<string, unknown> }[] }
  measurements: { edges: { node: Record<string, unknown> }[] }
  hyperboards: { edges: { node: Record<string, unknown> }[] }
  attachments: { edges: { node: Record<string, unknown> }[] }
} {
  const activities: { node: Record<string, unknown> }[] = []
  const collections: { node: Record<string, unknown> }[] = []
  const badgeAwards: { node: Record<string, unknown> }[] = []

  FEED_SPECS.forEach((spec, index) => {
    const uri = uriFor(spec, index)
    const createdAt = sortAtFor(index)
    if (spec.kind === "cert.create") {
      activities.push({
        node: {
          uri,
          cid: `bafyactivity${index}00000000000000000000000000000000000000`,
          did: spec.authorDid,
          title: spec.title,
          shortDescription: spec.shortDescription,
          createdAt,
          startDate: null,
          endDate: null,
          labels: [],
          image: null,
          workScope: { scope: "ecological-restoration" },
        },
      })
    } else if (spec.kind === "collection.create") {
      collections.push({
        node: {
          uri,
          cid: `bafycollection${index}0000000000000000000000000000000000`,
          did: spec.authorDid,
          createdAt,
          title: spec.title,
          shortDescription: spec.shortDescription,
          type: "project",
          items: [],
          avatar: null,
          banner: null,
        },
      })
    } else {
      badgeAwards.push({
        node: {
          uri,
          cid: `bafyaward${index}000000000000000000000000000000000000000000`,
          did: spec.authorDid,
          createdAt,
          note: "Verified the restoration claim end-to-end.",
          subject: {
            __typename: "AppCertifiedDefsDid",
            did: spec.subjectDid ?? MOCK_DID,
          },
        },
      })
    }
  })

  return {
    activities: { edges: activities },
    collections: { edges: collections },
    badgeAwards: { edges: badgeAwards },
    evaluations: { edges: [] },
    measurements: { edges: [] },
    hyperboards: { edges: [] },
    attachments: { edges: [] },
  }
}

/** Empty-but-valid `Activities` connection (profile Activities tab via
 *  indexer paths / explore). Profile own-activities go through PDS
 *  listRecords, but the generic `Activities` op is also reachable. */
export function activitiesConnection(): {
  totalCount: number
  edges: { cursor: string; node: Record<string, unknown> }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
  const edges = FEED_SPECS.filter((s) => s.kind === "cert.create").map(
    (spec, i) => ({
      cursor: `act-${i}`,
      node: {
        uri: `at://${spec.authorDid}/org.hypercerts.claim.activity/act${i}`,
        cid: `bafyact${i}0000000000000000000000000000000000000000000000000`,
        did: spec.authorDid,
        title: spec.title,
        shortDescription: spec.shortDescription,
        createdAt: sortAtFor(i),
        startDate: null,
        endDate: null,
        labels: [],
        image: null,
        workScope: { scope: "ecological-restoration" },
      },
    }),
  )
  return {
    totalCount: edges.length,
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  }
}

/** rkey of the fixture activity used by the `/dev/preview/activity-edit`
 *  surface. The preview route supplies this via PathParamsContext and the
 *  mock `getRecord` returns {@link activityEditRecord} for it. */
export const MOCK_ACTIVITY_RKEY = "previewactivity001"

/**
 * A single `org.hypercerts.claim.activity` record in the `getRecord`
 * envelope (`{ uri, cid, value }`) the `useActivity` hook expects. Lets
 * the activity-edit form hydrate against a fixture instead of 404ing.
 * Authored by the mock session DID so the edit route treats the viewer
 * as the owner.
 */
export function activityEditRecord(): {
  uri: string
  cid: string
  value: Record<string, unknown>
} {
  return {
    uri: `at://${MOCK_DID}/org.hypercerts.claim.activity/${MOCK_ACTIVITY_RKEY}`,
    cid: "bafyactivityedit0000000000000000000000000000000000000000000",
    value: {
      $type: "org.hypercerts.claim.activity",
      title: "Mangrove restoration — Tagus estuary, Q1",
      shortDescription:
        "Replanting and monitoring 12 ha of degraded mangrove along the Tagus estuary.",
      createdAt: "2024-02-10T09:30:00.000Z",
      startDate: "2024-01-01",
      endDate: "2024-03-31",
      workScope: { scope: "ecological-restoration" },
      contributors: [
        { contributorIdentity: { identity: MOCK_DID }, contributionWeight: "1" },
      ],
    },
  }
}
