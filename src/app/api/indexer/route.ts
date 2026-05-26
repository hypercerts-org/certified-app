import { NextRequest, NextResponse } from "next/server"
import { checkCsrf } from "@/lib/auth/csrf"
import { logSafe } from "@/lib/utils/log-safe"

/**
 * Same-origin proxy in front of the Magic Indexer's public GraphQL
 * endpoint.
 *
 * Trust boundary: the client sends an `operationName` + `variables`.
 * The server holds the actual query strings (see `OPERATIONS` below)
 * and per-operation variable validators. The indexer endpoint itself
 * is public (read-only, no service-auth required for these
 * operations), but holding the queries server-side means:
 *
 *   - Same-origin contexts (including any XSS payload that lands
 *     in our origin via a leaflet link / facet) can only invoke
 *     queries we know about — not arbitrary `mutation` ops, not
 *     deeply-nested introspection, not server-side request forgery
 *     of arbitrary indexer endpoints.
 *   - Variables are clamped + type-checked per-operation rather than
 *     forwarded raw, so an attacker can't push pathological inputs
 *     (10k-element arrays, multi-MB strings) downstream.
 *
 * Mirrors the pattern established by `/api/notifications`. The
 * difference is auth: notifications are personalised and require a
 * service-auth JWT minted from the user's PDS; the operations below
 * are public reads (feed, followers, received endorsements) and run
 * unauthenticated.
 */

const UPSTREAM_INDEXER_URL =
  process.env.INDEXER_URL ||
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  "https://magic-indexer-prod.up.railway.app/graphql"

// Mirror the module-load warning the notifications route has — flags
// the case where neither INDEXER_URL nor NEXT_PUBLIC_INDEXER_URL is
// set so the fallback default is silent in dev too. Production used
// to fall back to the dev indexer here; the default now points at
// prod so an unset env doesn't break the feed.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.INDEXER_URL &&
  !process.env.NEXT_PUBLIC_INDEXER_URL
) {
  console.warn(
    "[indexer] no INDEXER_URL set in production — using the built-in " +
      "fallback (magic-indexer-prod). Set INDEXER_URL in the Vercel project " +
      "env to override.",
  )
}

const UPSTREAM_TIMEOUT_MS = 15_000
// 32KB — operationName + variables. The 16KB original was too tight for
// HydrateFeedPage, which sends up to 50 at:// URIs per kind × 4 kinds.
const MAX_BODY_SIZE = 32 * 1024
const MAX_FIRST = 100
const MAX_FIRST_DEFINITIONS = 1000
const MAX_FEED_PAGE_SIZE = 50
const MAX_SEARCH_LEN = 200
const MAX_AFTER_LEN = 1024
const MAX_DID_LEN = 256
const MAX_DID_LIST = 1000
// Hard cap on `authors` for FollowerEvents, matching the indexer's
// `MaxAuthorsFilterSize`. The client also pre-truncates to this value;
// enforcing here is defence-in-depth so a manipulated request can't
// push a 10k-entry array downstream.
const MAX_AUTHORS_FILTER_SIZE = 500
const MAX_LABEL_LIST = 50
const MAX_LABEL_LEN = 64
const MAX_KIND_LIST = 16
const MAX_KIND_LEN = 64
const MAX_URI_LEN = 512
const MAX_URI_LIST_PER_KIND = 50

/** Activity node selection — shared by the three activity ops below. */
const ACTIVITY_NODE_SELECTION = `
  totalCount
  edges {
    cursor
    node {
      uri
      cid
      did
      title
      shortDescription
      createdAt
      startDate
      endDate
      labels
      image {
        __typename
        ... on OrgHypercertsDefsUri { uri }
        ... on OrgHypercertsDefsSmallImage { image { ref mimeType } }
      }
      workScope {
        ... on OrgHypercertsClaimActivityWorkScopeString { scope }
      }
    }
  }
  pageInfo {
    hasNextPage
    endCursor
  }
`

/**
 * Allowlist of GraphQL operations we forward. Names are stable across
 * client + server; query strings are server-only.
 *
 * NOTE on adding ops: a new entry MUST come with a `buildVariables`
 * branch below or the request 400s on unknown variables.
 */
const OPERATIONS: Record<string, string> = {
  // Global activity feed + per-label / per-author filters.
  Activities: `
    query Activities(
      $first: Int!
      $after: String
      $labels: [String!]
      $excludeLabels: [String!]
      $authors: [String!]
      $search: String
    ) {
      orgHypercertsClaimActivity(
        first: $first
        after: $after
        labels: $labels
        excludeLabels: $excludeLabels
        authors: $authors
        search: $search
      ) {
${ACTIVITY_NODE_SELECTION}
      }
    }
  `,

  // Per-user "authored" activities (Certs tab > Created bucket).
  AuthoredActivities: `
    query AuthoredActivities(
      $did: String!
      $first: Int!
      $after: String
      $labels: [String!]
      $excludeLabels: [String!]
      $search: String
    ) {
      orgHypercertsClaimActivity(
        first: $first
        after: $after
        labels: $labels
        excludeLabels: $excludeLabels
        search: $search
        where: { did: { eq: $did } }
      ) {
${ACTIVITY_NODE_SELECTION}
      }
    }
  `,

  // Per-user "contributed to" activities (Certs tab > Contributed bucket).
  ContributedActivities: `
    query ContributedActivities(
      $did: String!
      $first: Int!
      $after: String
      $labels: [String!]
      $excludeLabels: [String!]
      $search: String
    ) {
      orgHypercertsClaimActivity(
        first: $first
        after: $after
        labels: $labels
        excludeLabels: $excludeLabels
        search: $search
        where: { contributor: { eq: $did } }
      ) {
${ACTIVITY_NODE_SELECTION}
      }
    }
  `,

  // Followers of a profile DID.
  Followers: `
    query Followers($did: String!, $first: Int!, $after: String) {
      appCertifiedGraphFollow(
        where: { subject: { eq: $did } }
        first: $first
        after: $after
      ) {
        totalCount
        edges { node { uri cid did createdAt } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Endorsement awards received by a profile DID — single-query
  // shape per hb-agent/magic-indexer#96. Three indexer-side joins
  // collapsed in here:
  //   - `where.badgeType` filters out non-endorsement awards
  //     server-side (drops the previous batch query against
  //     `appCertifiedBadgeDefinition` + the local URI-match filter).
  //   - `issuer { ... }` denormalises the issuer's actor profile
  //     onto each award node (drops the per-row `/api/resolve-did`
  //     fan-out on first paint, once the operator enables
  //     `app.bsky.actor.profile` ingestion on magic-indexer dev).
  //   - `response { state }` carries the recipient's latest
  //     accept/reject response (drops the parallel PDS
  //     `listResponses` call in `useProfileResponses` for this
  //     hot path). Ordered by sort_at DESC NULLS LAST per indexer
  //     #26, so reset-to-default-then-accept resolves correctly.
  ReceivedEndorsements: `
    query ReceivedEndorsements($did: String!, $first: Int!, $after: String) {
      appCertifiedBadgeAward(
        where: { subject: { eq: $did }, badgeType: { eq: "endorsement" } }
        first: $first
        after: $after
      ) {
        edges {
          node {
            uri cid did createdAt note badge
            issuer { did handle displayName description avatarCid pds }
            response { state weight createdAt }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Endorsement-typed badge definitions for a batch of issuer DIDs.
  EndorsementDefs: `
    query EndorsementDefs($dids: [String!]!, $first: Int!) {
      appCertifiedBadgeDefinition(
        where: { did: { in: $dids }, badgeType: { eq: "endorsement" } }
        first: $first
      ) {
        edges { node { uri title } }
      }
    }
  `,

  // Network-wide actor list for the /workspace pages. Returns the
  // most-recently-indexed profiles so the actor switcher has
  // something to show even before the user has interacted.
  NetworkActors: `
    query NetworkActors($first: Int!, $after: String) {
      appCertifiedActorProfile(first: $first, after: $after) {
        totalCount
        edges {
          cursor
          node {
            uri
            did
            displayName
            description
            createdAt
            avatar {
              __typename
              ... on OrgHypercertsDefsUri { uri }
              ... on OrgHypercertsDefsSmallImage { image { ref mimeType } }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Just the DIDs of every actor that has published an
  // app.certified.actor.organization record. Used by the /explore
  // Users sub-category to split individuals from groups —
  // displayName + avatar live on the actor-profile record, not the
  // organization record, so consumers join both client-side.
  OrganizationDids: `
    query OrganizationDids($first: Int!, $after: String) {
      appCertifiedActorOrganization(first: $first, after: $after) {
        totalCount
        edges { cursor node { did } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Per-actor counts of the major lexicons. One round-trip via
  // aliased connections — each branch shares the where: { did: $did }
  // filter so we get five small headers back in one fetch.
  ActorWorkspaceCounts: `
    query ActorWorkspaceCounts($did: String!) {
      certs: orgHypercertsClaimActivity(first: 1, where: { did: { eq: $did } }) {
        totalCount
      }
      projects: orgHypercertsCollection(
        first: 1
        where: { did: { eq: $did }, type: { eqi: "project" } }
      ) {
        totalCount
      }
      lists: orgHypercertsCollection(
        first: 1
        where: { did: { eq: $did }, type: { eqi: "endorsement-list" } }
      ) {
        totalCount
      }
      endorsementsReceived: appCertifiedBadgeAward(
        first: 1
        where: { subject: { eq: $did }, badgeType: { eq: "endorsement" } }
      ) {
        totalCount
      }
      followers: appCertifiedGraphFollow(
        first: 1
        where: { subject: { eq: $did } }
      ) {
        totalCount
      }
    }
  `,

  // Network-wide counts for the /welcome landing-page stats strip.
  // Each query asks for a single page (first: 1) just to surface
  // `totalCount`; client discards the edge. Selection mirrors the
  // shape every other op uses (`totalCount + edges + pageInfo`)
  // because some GraphQL schemas reject a bare-aggregate selection
  // on a connection root.
  ProfileCount: `
    query ProfileCount {
      appCertifiedActorProfile(first: 1) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,
  OrganizationCount: `
    query OrganizationCount {
      appCertifiedActorOrganization(first: 1) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,
  ActivityCount: `
    query ActivityCount {
      orgHypercertsClaimActivity(first: 1) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,
  ProjectCount: `
    query ProjectCount {
      orgHypercertsCollection(
        first: 1
        where: { type: { eqi: "project" } }
      ) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,
  AwardCount: `
    query AwardCount {
      appCertifiedBadgeAward(first: 1) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
      }
    }
  `,

  // Generic project listing for the /explore page. Takes an optional
  // `authors` filter (null = no scope, [] = match nothing, [...] =
  // restrict to those DIDs) and an optional case-insensitive
  // free-text search. Returns the same node shape as UserProjects.
  Projects: `
    query Projects(
      $first: Int!
      $after: String
      $authors: [String!]
      $search: String
    ) {
      orgHypercertsCollection(
        first: $first
        after: $after
        where: { type: { eqi: "project" } }
        authors: $authors
        search: $search
      ) {
        totalCount
        edges {
          cursor
          node {
            uri
            cid
            did
            createdAt
            title
            shortDescription
            items {
              itemIdentifier {
                ... on ComAtprotoRepoStrongRef { uri cid }
              }
            }
            banner {
              __typename
              ... on OrgHypercertsDefsUri { uri }
              ... on OrgHypercertsDefsLargeImage { image { ref mimeType } }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Projects authored by a single DID. Replaces the per-DID PDS
  // listRecords scan in useUserProjects: the indexer handles the
  // case-insensitive "project" type filter server-side via eqi
  // (magic-indexer#81), which means records storing the discriminator
  // as "Project" / "PROJECT" surface here too.
  //
  // Selected fields cover what profile-projects renders: title,
  // shortDescription, createdAt, banner, items[]. The indexer does NOT
  // surface the legacy value.name / value.image fallback fields some
  // older records use — that's intentional. Records on the older shape
  // will read "Untitled project" / no banner here so authors notice
  // and re-publish on the canonical shape while the dataset is small.
  UserProjects: `
    query UserProjects($did: String!, $first: Int!, $after: String) {
      orgHypercertsCollection(
        first: $first
        after: $after
        where: { did: { eq: $did }, type: { eqi: "project" } }
      ) {
        totalCount
        edges {
          cursor
          node {
            uri
            cid
            did
            createdAt
            title
            shortDescription
            items {
              itemIdentifier {
                ... on ComAtprotoRepoStrongRef { uri cid }
              }
            }
            banner {
              __typename
              ... on OrgHypercertsDefsUri { uri }
              ... on OrgHypercertsDefsLargeImage { image { ref mimeType } }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Legacy temp endorsement records — pre-badge-migration. Kept for
  // the read-side compatibility window. Drop when no longer referenced.
  LegacyEndorsements: `
    query LegacyEndorsements($authors: [String!]!, $first: Int!, $after: String) {
      appCertifiedTempGraphEndorsement(
        first: $first
        after: $after
        authors: $authors
      ) {
        edges {
          cursor
          node {
            uri
            did
            subject { did }
            createdAt
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Viewer-centric endorsement-graph closure — magic-indexer issue
  // #117. Returns DIDs reachable within `degree` hops of `viewer`
  // through active (non-rejected, endorsement-typed) badge awards,
  // plus per-DID provenance (which degree-(d-1) accounts brought
  // them in). Powers /explore "Endorsed users" filter via
  // src/hooks/use-explore.ts → fetchEndorsementClosure → this
  // operation. Truncates with `truncated: true` if the closure
  // exceeds the server cap (default 3000); UI shows a "showing a
  // subset" notice in that case.
  EndorsementClosure: `
    query EndorsementClosure($viewer: String!, $degree: Int!) {
      endorsementClosure(viewer: $viewer, degree: $degree) {
        accounts {
          did
          degree
          via
          issuer {
            did
            handle
            displayName
            description
            avatarCid
            pds
          }
        }
        truncated
      }
    }
  `,

  // Home-timeline feed — magic-indexer #122. Single GraphQL field that
  // returns the union of the viewer's relevant lexicon-level "create"
  // events authored by `authors` (the viewer's follow union). The
  // `actor` is denormalised onto each FeedEvent so the client doesn't
  // need a per-row profile lookup. Headline render still hydrates the
  // record via `HydrateFeedPage` because the `subjectUri` only carries
  // the URI.
  //
  // Coded errors (returned via `errors[].extensions.code`):
  //   - AUTHORS_FILTER_TOO_LARGE — set on the indexer (cap is
  //     `MaxAuthorsFilterSize = 500`). The proxy also caps at 500
  //     so this should be unreachable in normal use.
  //   - INVALID_CURSOR — opaque cursor failed to decode.
  //   - AUTHORS_REQUIRED — defensive; proxy rejects first via the
  //     `readAuthorList` required-array check.
  FollowerEvents: `
    query FollowerEvents(
      $authors: [String!]!
      $first: Int!
      $after: String
      $kinds: [String!]
    ) {
      followerEvents(
        authors: $authors
        first: $first
        after: $after
        kinds: $kinds
      ) {
        edges {
          cursor
          node {
            id
            kind
            subjectUri
            sortAt
            actor {
              did
              handle
              displayName
              avatarCid
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,

  // Headline-render hydration for one FollowerEvents page. Buckets each
  // event by `kind` into a per-lexicon URI list and fetches all four
  // connections in one round-trip via `where: { uri: { in: $uris } }`.
  // Empty arrays are valid (and expected — most pages only have a
  // subset of the four kinds present); the indexer returns an empty
  // connection for each empty filter.
  //
  // If `where: { uri: { in: [...] } }` is not supported by the indexer
  // schema for one of these collections, the client falls back to a
  // per-collection op fan-out — see the track-1 log for details.
  HydrateFeedPage: `
    query HydrateFeedPage(
      $activityUris: [String!]!
      $collectionUris: [String!]!
      $badgeAwardUris: [String!]!
      $evaluationUris: [String!]!
      $measurementUris: [String!]!
      $hyperboardUris: [String!]!
      $attachmentUris: [String!]!
    ) {
      activities: orgHypercertsClaimActivity(
        first: ${MAX_URI_LIST_PER_KIND}
        where: { uri: { in: $activityUris } }
      ) {
        edges {
          node {
            uri
            cid
            did
            title
            shortDescription
            createdAt
            startDate
            endDate
            labels
            image {
              __typename
              ... on OrgHypercertsDefsUri { uri }
              ... on OrgHypercertsDefsSmallImage { image { ref mimeType } }
            }
            workScope {
              ... on OrgHypercertsClaimActivityWorkScopeString { scope }
            }
          }
        }
      }
      collections: orgHypercertsCollection(
        first: ${MAX_URI_LIST_PER_KIND}
        where: { uri: { in: $collectionUris } }
      ) {
        edges {
          node {
            uri
            cid
            did
            createdAt
            title
            shortDescription
            type
            items {
              itemIdentifier {
                ... on ComAtprotoRepoStrongRef { uri cid }
              }
            }
            avatar {
              __typename
              ... on OrgHypercertsDefsUri { uri }
              ... on OrgHypercertsDefsSmallImage { image { ref mimeType } }
            }
            banner {
              __typename
              ... on OrgHypercertsDefsUri { uri }
              ... on OrgHypercertsDefsLargeImage { image { ref mimeType } }
            }
          }
        }
      }
      badgeAwards: appCertifiedBadgeAward(
        first: ${MAX_URI_LIST_PER_KIND}
        where: { uri: { in: $badgeAwardUris } }
      ) {
        edges {
          node {
            uri
            cid
            did
            createdAt
            note
            subject {
              __typename
              ... on AppCertifiedDefsDid { did }
            }
          }
        }
      }
      evaluations: orgHypercertsContextEvaluation(
        first: ${MAX_URI_LIST_PER_KIND}
        where: { uri: { in: $evaluationUris } }
      ) {
        edges {
          node {
            uri
            cid
            did
            createdAt
            summary
            subject {
              __typename
              ... on ComAtprotoRepoStrongRef { uri cid }
            }
          }
        }
      }
      measurements: orgHypercertsContextMeasurement(
        first: ${MAX_URI_LIST_PER_KIND}
        where: { uri: { in: $measurementUris } }
      ) {
        edges {
          node {
            uri
            cid
            did
            createdAt
            metric
            value
            unit
            subjects {
              __typename
              ... on ComAtprotoRepoStrongRef { uri cid }
            }
          }
        }
      }
      hyperboards: orgHyperboardsBoard(
        first: ${MAX_URI_LIST_PER_KIND}
        where: { uri: { in: $hyperboardUris } }
      ) {
        edges {
          node {
            uri
            cid
            did
            createdAt
          }
        }
      }
      attachments: orgHypercertsContextAttachment(
        first: ${MAX_URI_LIST_PER_KIND}
        where: { uri: { in: $attachmentUris } }
      ) {
        edges {
          node {
            uri
            cid
            did
            createdAt
            title
          }
        }
      }
    }
  `,
}

type ClientVariables = Record<string, unknown>

function clampFirst(value: unknown, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(1, Math.floor(value)), max)
}

function readString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null
  if (value.length === 0 || value.length > maxLen) return null
  return value
}

function readDid(value: unknown): string | null {
  const s = readString(value, MAX_DID_LEN)
  if (!s) return null
  return s.startsWith("did:") ? s : null
}

function readDidList(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value)) return null
  if (value.length === 0 || value.length > maxItems) return null
  // Fail-soft: filter out non-DID entries silently rather than
  // rejecting the whole batch. A single malformed DID in the
  // indexed data (e.g. a contributor field that wasn't normalised
  // upstream) shouldn't take out an entire Received-endorsements
  // panel for every viewer. Issue #73 / round-2 receivers' fix.
  // Returns null only when nothing valid remains — at that point
  // the caller's GraphQL `where: { did: { in: [] } }` would return
  // empty anyway, so saving a round-trip.
  const out: string[] = []
  for (const item of value) {
    const did = readDid(item)
    if (did) out.push(did)
  }
  if (out.length === 0) return null
  return out
}

function readOptionalDidList(value: unknown): string[] | null | undefined {
  // tri-state: undefined (no filter), [] (match nothing), [...] (filter)
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) return undefined
  if (value.length === 0) return []
  if (value.length > MAX_DID_LIST) return undefined
  const out: string[] = []
  for (const item of value) {
    const did = readDid(item)
    if (!did) return undefined
    out.push(did)
  }
  return out
}

function readLabelList(value: unknown): string[] | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return null
  if (value.length === 0 || value.length > MAX_LABEL_LIST) return null
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") return null
    if (item.length === 0 || item.length > MAX_LABEL_LEN) return null
    out.push(item)
  }
  return out
}

/**
 * Reads the `authors` argument for `FollowerEvents`.
 *
 *   - Required (cannot be omitted; the indexer's `AUTHORS_REQUIRED` is
 *     defensive, our proxy rejects first).
 *   - Length 0..MAX_AUTHORS_FILTER_SIZE inclusive. The empty array is
 *     load-bearing: the upstream returns an empty connection rather
 *     than an error, which the client uses for the
 *     no-follows-yet case.
 *   - Per-entry: non-DID strings are filtered out silently
 *     (fail-soft, matching `readDidList`). Returns null only on
 *     structural failure or oversize, not on bad-entry content —
 *     a single malformed DID in a viewer's follow list shouldn't
 *     take out their entire feed.
 */
function readAuthorList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (value.length > MAX_AUTHORS_FILTER_SIZE) return null
  const out: string[] = []
  for (const item of value) {
    const did = readDid(item)
    if (did) out.push(did)
  }
  return out
}

/**
 * Reads the optional `kinds` inclusion filter on `FollowerEvents`.
 * The cap numbers are defensive defaults (the spec doesn't mandate
 * them), kept tight so a manipulated request can't push pathological
 * inputs downstream. Returns null for structurally-invalid input
 * (non-array / non-string entry / oversized), which 400s the request.
 */
function readKindList(value: unknown): string[] | null | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) return null
  if (value.length === 0) return undefined
  if (value.length > MAX_KIND_LIST) return null
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") return null
    if (item.length === 0 || item.length > MAX_KIND_LEN) return null
    out.push(item)
  }
  return out
}

/**
 * Reads one of the `*Uris` array variables for `HydrateFeedPage`.
 * Length 0..MAX_URI_LIST_PER_KIND inclusive — empty arrays pass
 * through because a typical page has events of only a few kinds and
 * the other arrays should be `[]`.
 */
function readUriList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (value.length > MAX_URI_LIST_PER_KIND) return null
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") return null
    if (item.length === 0 || item.length > MAX_URI_LEN) return null
    out.push(item)
  }
  return out
}

/**
 * Normalize client-supplied variables per-operation. Returns null when
 * required vars are missing or malformed — the route then 400s.
 *
 * Required vars are pulled with strict readers (`readDid` etc.) that
 * return null on miss. Optional vars are pulled with permissive
 * readers that fall back to `null` so the GraphQL query receives the
 * "no filter" sentinel.
 */
function buildVariables(
  operationName: string,
  vars: ClientVariables,
): Record<string, unknown> | null {
  switch (operationName) {
    case "Activities": {
      const authors = readOptionalDidList(vars.authors)
      return {
        first: clampFirst(vars.first, MAX_FIRST, 20),
        after: readString(vars.after, MAX_AFTER_LEN),
        labels: readLabelList(vars.labels),
        excludeLabels: readLabelList(vars.excludeLabels),
        authors: authors === undefined ? null : authors,
        search: readString(vars.search, MAX_SEARCH_LEN),
      }
    }
    case "AuthoredActivities":
    case "ContributedActivities": {
      const did = readDid(vars.did)
      if (!did) return null
      return {
        did,
        first: clampFirst(vars.first, MAX_FIRST, 20),
        after: readString(vars.after, MAX_AFTER_LEN),
        labels: readLabelList(vars.labels),
        excludeLabels: readLabelList(vars.excludeLabels),
        search: readString(vars.search, MAX_SEARCH_LEN),
      }
    }
    case "Followers":
    case "ReceivedEndorsements": {
      const did = readDid(vars.did)
      if (!did) return null
      return {
        did,
        first: clampFirst(vars.first, MAX_FIRST, 100),
        after: readString(vars.after, MAX_AFTER_LEN),
      }
    }
    case "EndorsementDefs": {
      const dids = readDidList(vars.dids, MAX_DID_LIST)
      if (!dids) return null
      return {
        dids,
        first: clampFirst(vars.first, MAX_FIRST_DEFINITIONS, MAX_FIRST_DEFINITIONS),
      }
    }
    case "ProfileCount":
    case "OrganizationCount":
    case "ActivityCount":
    case "ProjectCount":
    case "AwardCount": {
      // Zero-argument operations — nothing to validate. Return an
      // empty object so the route's null-check passes and the
      // query is forwarded.
      return {}
    }
    case "UserProjects": {
      const did = readDid(vars.did)
      if (!did) return null
      return {
        did,
        first: clampFirst(vars.first, MAX_FIRST, 50),
        after: readString(vars.after, MAX_AFTER_LEN),
      }
    }
    case "Projects": {
      const authors = readOptionalDidList(vars.authors)
      return {
        first: clampFirst(vars.first, MAX_FIRST, 24),
        after: readString(vars.after, MAX_AFTER_LEN),
        authors: authors === undefined ? null : authors,
        search: readString(vars.search, MAX_SEARCH_LEN),
      }
    }
    case "NetworkActors":
    case "OrganizationDids": {
      return {
        first: clampFirst(vars.first, MAX_FIRST, 20),
        after: readString(vars.after, MAX_AFTER_LEN),
      }
    }
    case "ActorWorkspaceCounts": {
      const did = readDid(vars.did)
      if (!did) return null
      return { did }
    }
    case "LegacyEndorsements": {
      const authors = readDidList(vars.authors, MAX_DID_LIST)
      if (!authors) return null
      return {
        authors,
        first: clampFirst(vars.first, MAX_FIRST, 100),
        after: readString(vars.after, MAX_AFTER_LEN),
      }
    }
    case "EndorsementClosure": {
      // Viewer-centric BFS closure (magic-indexer #117). `viewer`
      // must be a DID; `degree` must be ∈ {1, 2, 3}. Validation here
      // mirrors the indexer-side gate so a malformed request 400s
      // at the proxy rather than producing a noisy GraphQL error
      // downstream.
      const viewer = readDid(vars.viewer)
      if (!viewer) return null
      const rawDegree = vars.degree
      if (typeof rawDegree !== "number" || !Number.isInteger(rawDegree)) return null
      if (rawDegree < 1 || rawDegree > 3) return null
      return { viewer, degree: rawDegree }
    }
    case "FollowerEvents": {
      const authors = readAuthorList(vars.authors)
      if (authors === null) return null
      const kinds = readKindList(vars.kinds)
      if (kinds === null) return null
      return {
        authors,
        first: clampFirst(vars.first, MAX_FEED_PAGE_SIZE, 20),
        after: readString(vars.after, MAX_AFTER_LEN),
        kinds: kinds ?? null,
      }
    }
    case "HydrateFeedPage": {
      const activityUris = readUriList(vars.activityUris)
      const collectionUris = readUriList(vars.collectionUris)
      const badgeAwardUris = readUriList(vars.badgeAwardUris)
      const evaluationUris = readUriList(vars.evaluationUris)
      const measurementUris = readUriList(vars.measurementUris)
      const hyperboardUris = readUriList(vars.hyperboardUris)
      const attachmentUris = readUriList(vars.attachmentUris)
      if (
        activityUris === null ||
        collectionUris === null ||
        badgeAwardUris === null ||
        evaluationUris === null ||
        measurementUris === null ||
        hyperboardUris === null ||
        attachmentUris === null
      ) {
        return null
      }
      return {
        activityUris,
        collectionUris,
        badgeAwardUris,
        evaluationUris,
        measurementUris,
        hyperboardUris,
        attachmentUris,
      }
    }
    default:
      return null
  }
}

/**
 * POST /api/indexer
 *
 * Body: `{ operationName: string; variables?: Record<string, unknown> }`
 *
 * Response: the upstream GraphQL response body verbatim, with
 * upstream status code preserved. GraphQL errors (200 with `errors`)
 * pass through to the client as they always have.
 */
export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  const contentLength = request.headers.get("content-length")
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: "Request body too large" },
      { status: 413 },
    )
  }

  let parsed: { operationName?: unknown; variables?: unknown }
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 },
      )
    }
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof parsed.operationName !== "string") {
    return NextResponse.json(
      { error: "operationName is required" },
      { status: 400 },
    )
  }
  const operationName = parsed.operationName

  const query = OPERATIONS[operationName]
  if (!query) {
    return NextResponse.json({ error: "Unknown operation" }, { status: 400 })
  }

  const clientVars =
    parsed.variables && typeof parsed.variables === "object"
      ? (parsed.variables as ClientVariables)
      : {}
  const variables = buildVariables(operationName, clientVars)
  if (!variables) {
    return NextResponse.json(
      { error: "Invalid variables for operation" },
      { status: 400 },
    )
  }

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    UPSTREAM_TIMEOUT_MS,
  )
  const signal = AbortSignal.any([request.signal, timeoutController.signal])

  try {
    const upstream = await fetch(UPSTREAM_INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables, operationName }),
      signal,
    })

    const responseBody = await upstream.text()
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    })
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string }
    if (error?.name === "AbortError") {
      logSafe("[indexer] upstream timeout", err)
      return NextResponse.json(
        { error: "Indexer request timed out" },
        { status: 504 },
      )
    }
    logSafe("[indexer] upstream failed", err)
    return NextResponse.json(
      { error: "Indexer request failed" },
      { status: 502 },
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
