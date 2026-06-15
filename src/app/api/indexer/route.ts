import { NextRequest, NextResponse } from "next/server"
import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"
import { logSafe } from "@/lib/utils/log-safe"
import {
  DEFAULT_HIDDEN_CERT_LABELS,
  DEFAULT_HIDDEN_ORG_LABELS,
} from "@/lib/atproto/labels"

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
 * The operations below are public reads (feed, followers, received
 * endorsements) and run unauthenticated against the indexer.
 */

const UPSTREAM_INDEXER_URL =
  process.env.INDEXER_URL ||
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  "https://magic-indexer-prod.up.railway.app/graphql"

// Module-load warning — flags the case where neither INDEXER_URL nor
// NEXT_PUBLIC_INDEXER_URL is
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

// IP-scoped rate limiter — defence in depth against a same-origin
// script / XSS fan-out abusing the proxy. Sized higher than the
// other BFF routes (resolve-handle = 100/min, search-actors =
// 60/min) because the indexer is the highest-fan-out route in the
// app: every home-feed page is 2 RPCs (FollowerEvents +
// HydrateFeedPage), every explore filter change is 2-3 RPCs, every
// profile-tab switch is 1+N. A power user navigating across tabs
// can plausibly cross 120/min in normal use. The real
// XSS/abuse defences here are the per-op variable caps, the
// 15s upstream timeout, and the 32KB body cap — this limit is just
// the global brake that ensures one IP can't monopolise the
// upstream throughput.
const LIMITER = makeLimiter("indexer-proxy", 240, 60)
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
/** Per-kind URI cap for the `HydrateFeedPage` op (4 kinds × 50 = up to
 *  200 URIs total per feed page). Matches the indexer's hard cap on
 *  the `where: { uri: { in: [...] } }` filter (50 entries; values
 *  above that error out with "in list must contain 1 to 50 values").
 *  The GraphQL query also embeds this as `first: ${MAX_URI_LIST_PER_KIND}`
 *  so changing it here changes the page size on the wire too. */
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
        ... on OrgHypercertsWorkscopeCel { expression }
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
      $authorLabels: [String!]
      $excludeAuthorLabels: [String!]
      $search: String
    ) {
      orgHypercertsClaimActivity(
        first: $first
        after: $after
        labels: $labels
        excludeLabels: $excludeLabels
        authors: $authors
        authorLabels: $authorLabels
        excludeAuthorLabels: $excludeAuthorLabels
        search: $search
      ) {
${ACTIVITY_NODE_SELECTION}
      }
    }
  `,

  // Fetch a specific set of activity URIs, with optional label
  // include / exclude filters applied server-side. Used by surfaces
  // that already know the URIs they want (e.g. the explore page's
  // Ma Earth featured filter) and need labels on the records so
  // the same Quality popover that filters server-side on the
  // generic Activities op also works here.
  ActivitiesByUris: `
    query ActivitiesByUris(
      $uris: [String!]!
      $labels: [String!]
      $excludeLabels: [String!]
      $authorLabels: [String!]
      $excludeAuthorLabels: [String!]
    ) {
      orgHypercertsClaimActivity(
        first: 100
        where: { uri: { in: $uris } }
        labels: $labels
        excludeLabels: $excludeLabels
        authorLabels: $authorLabels
        excludeAuthorLabels: $excludeAuthorLabels
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

  // Deduped union count of activities a profile CREATED or CONTRIBUTED
  // to. The `_or` returns each matching record once, so `totalCount` is
  // the exact unique count (created ∪ contributed) — unlike summing the
  // two per-bucket totals, which double-counts a record where the user
  // is both author and contributor.
  UserActivityCount: `
    query UserActivityCount($did: String!) {
      orgHypercertsClaimActivity(
        first: 1
        where: { _or: [{ did: { eq: $did } }, { contributor: { eq: $did } }] }
      ) {
        totalCount
        edges { node { uri } }
        pageInfo { hasNextPage }
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
            uri cid did createdAt note badge { uri cid }
            issuer { did handle displayName description avatarCid pds }
            response { state weight createdAt }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Subject DIDs endorsed by any of a set of evaluator DIDs. Backs
  // the home feed's "trusted evaluators" expansion — selecting an
  // evaluator pulls in the activity of everyone they've endorsed.
  // Paginated because a single prolific evaluator can issue
  // hundreds of awards; client unions pages into a Set.
  EvaluatorEndorsements: `
    query EvaluatorEndorsements($evaluators: [String!]!, $first: Int!, $after: String) {
      appCertifiedBadgeAward(
        where: { did: { in: $evaluators }, badgeType: { eq: "endorsement" } }
        first: $first
        after: $after
      ) {
        edges {
          cursor
          node {
            did
            subject {
              __typename
              ... on AppCertifiedDefsDid { did }
            }
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
    query NetworkActors(
      $first: Int!
      $after: String
      $search: String
      $authorLabels: [String!]
      $excludeAuthorLabels: [String!]
    ) {
      appCertifiedActorProfile(
        first: $first
        after: $after
        search: $search
        authorLabels: $authorLabels
        excludeAuthorLabels: $excludeAuthorLabels
      ) {
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

  // Same shape as NetworkActors but server-side-filtered to a
  // single kind via the indexer's `isOrganization` flag (see
  // certified-app#107 / magic-indexer#145). Used by the /explore
  // Accounts People / Organizations sub-toggle so the result list
  // paginates over members of that kind only — replaces the
  // previous "fetch a mixed page + intersect client-side against
  // the first-200 org DIDs" path that silently dropped any org
  // beyond the first page and produced under-shown People pages.
  //
  // Kept as a separate operation (rather than threading
  // `$isOrganization: Boolean = null`) because graphql-go rejects
  // explicit `null` on the `eq` operator — the only safe way to
  // express "no filter" is to omit the `where` arg entirely, which
  // means a different query string. Two operations is the smallest
  // diff. The unfiltered case stays on the original NetworkActors
  // op above.
  NetworkActorsByKind: `
    query NetworkActorsByKind(
      $first: Int!
      $after: String
      $isOrganization: Boolean!
      $search: String
      $authorLabels: [String!]
      $excludeAuthorLabels: [String!]
    ) {
      appCertifiedActorProfile(
        first: $first
        after: $after
        search: $search
        authorLabels: $authorLabels
        excludeAuthorLabels: $excludeAuthorLabels
        where: { isOrganization: { eq: $isOrganization } }
      ) {
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

  // Org DIDs filtered by orglabeler tier. Backs the explore page's
  // "Account quality" filter on the certs + accounts tabs: get the
  // set of org DIDs matching the viewer's tier selection, then
  // either use it to scope the certs `authors` filter or to
  // narrow the actor list. Same shape as `OrganizationDids` but
  // adds the label include / exclude args.
  OrganizationDidsByLabel: `
    query OrganizationDidsByLabel(
      $first: Int!
      $after: String
      $labels: [String!]
      $excludeLabels: [String!]
    ) {
      appCertifiedActorOrganization(
        first: $first
        after: $after
        labels: $labels
        excludeLabels: $excludeLabels
      ) {
        totalCount
        edges { cursor node { did } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Actor profiles for a specific set of DIDs. Bypasses the 100-
  // most-recently-indexed pagination cap on `NetworkActors` when
  // the caller already knows which DIDs they want — used by the
  // explore page's "Account quality (include only)" path, where
  // we resolve org DIDs via `OrganizationDidsByLabel` and then
  // fetch the matching profiles in one shot.
  NetworkActorsByDids: `
    query NetworkActorsByDids($dids: [String!]!) {
      appCertifiedActorProfile(
        first: 100
        where: { did: { in: $dids } }
      ) {
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

  // "Of this DID set, which ones are organizations?" — a focused
  // companion to NetworkActorsByDids that returns just the org-DID
  // subset (no profile fields). Used by /explore Accounts to apply
  // the People/Organizations sub-toggle on paths where the actor
  // list comes from a known DID set rather than `fetchNetworkActors`:
  //   - Featured (Ma Earth curated projects → author DIDs)
  //   - Endorsed (closure result's inline issuer block)
  // The server-side `isOrganization` filter on appCertifiedActorProfile
  // can't run via fetchNetworkActors there because the actor list is
  // already determined by a different upstream — but the same filter
  // works keyed on a `did: { in: [...] }` predicate, which this op
  // exposes. Returns at most 100 DIDs per call (MAX_FIRST cap on the
  // upstream); callers chunk if their set is larger.
  OrganizationDidsForSet: `
    query OrganizationDidsForSet($dids: [String!]!) {
      appCertifiedActorProfile(
        first: 100
        where: { did: { in: $dids }, isOrganization: { eq: true } }
      ) {
        edges { node { did } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Parameterised "of this DID set, which match the given kind?".
  // Replaces the complement-based approach (fetch ORG dids, then
  // !has() for People) that silently inverted on the client when
  // the call returned 0 results — caller couldn't distinguish
  // "everyone is people" from "the call failed and the set is
  // empty by mistake". With this op the result is unambiguous:
  // returned DIDs ARE the matching kind, period.
  DidsByKindInSet: `
    query DidsByKindInSet(
      $dids: [String!]!
      $isOrganization: Boolean!
    ) {
      appCertifiedActorProfile(
        first: 100
        where: { did: { in: $dids }, isOrganization: { eq: $isOrganization } }
      ) {
        edges { node { did } }
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
        where: { did: { eq: $did }, type: { eqi: "list:endorsements" } }
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
  // "Users" = personal + org actors. Excludes accounts labelled "likely-test"
  // via `excludeAuthorLabels` (account-quality labels live on the bare account
  // DID, so the profile connection's own-record-URI `excludeLabels` would NOT
  // match — see magic-indexer#206/#207). Unlabeled accounts still count.
  ProfileCount: `
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
  // Excludes orgs labelled "likely-test" so the public counter matches the
  // explore/feed default policy (DEFAULT_HIDDEN_ORG_LABELS). Unlabeled orgs
  // still count — labelers only weigh in once they've caught up.
  OrganizationCount: `
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
  // Excludes activities by both the record's own label (draft / likely-test,
  // Activity-Labeler tier — DEFAULT_HIDDEN_CERT_LABELS) AND the author's
  // account label (records authored by likely-test accounts, via
  // excludeAuthorLabels — magic-indexer#207). Unlabeled records / authors
  // still count.
  ActivityCount: `
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
  // Excludes projects authored by likely-test accounts (projects carry no
  // own quality label, so only the author-account filter applies).
  ProjectCount: `
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
  // Excludes endorsements created by likely-test accounts (the award's author
  // is its issuer).
  AwardCount: `
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

  // Generic project listing for the /explore page. Takes an optional
  // `authors` filter (null = no scope, [] = match nothing, [...] =
  // restrict to those DIDs) and an optional case-insensitive
  // free-text search. Returns the same node shape as UserProjects.
  Projects: `
    query Projects(
      $first: Int!
      $after: String
      $authors: [String!]
      $authorLabels: [String!]
      $excludeAuthorLabels: [String!]
      $search: String
    ) {
      orgHypercertsCollection(
        first: $first
        after: $after
        where: { type: { eqi: "project" } }
        authors: $authors
        authorLabels: $authorLabels
        excludeAuthorLabels: $excludeAuthorLabels
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

  // Cross-DID "projects containing this cert" — backs the cert
  // detail page's Projects section. Replaces the per-DID PDS
  // listRecords stopgap in `use-cert-projects.ts` now that
  // magic-indexer #110's `itemUri` promoted filter has shipped.
  // Returns the same `orgHypercertsCollection` node shape as
  // `UserProjects` so the consumer can reuse the existing
  // CollectionRecord rendering.
  ProjectsContainingCert: `
    query ProjectsContainingCert($certUri: String!, $first: Int!) {
      orgHypercertsCollection(
        first: $first
        where: {
          type: { eqi: "project" }
          itemUri: { eq: $certUri }
        }
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

  // Funding receipts (org.hypercerts.funding.receipt) for the /explore
  // Funding tab. Both `from` and `to` are unions that are either an AT
  // Protocol account (AppCertifiedDefsDid) or a free-text label
  // (OrgHypercertsFundingReceiptText); `from` is nullable, `to` is not.
  // `for` is an optional strongRef pointing at an
  // org.hypercerts.claim.activity. The indexer can't filter by union
  // variant, so the explore loader applies the "from OR to is an
  // account" gate client-side after fetching.
  // `attestations` + `confirmedBy` require magic-indexer #214; until that
  // deploys this operation errors against the upstream and the funding
  // view fail-softs to empty. Held off `staging` on feat/funding-attestations
  // until #214 ships. `confirmedBy` is a nullable DID — null means "no
  // filter"; a value restricts to payments with a third-party attestor of
  // that DID (the /explore "Confirmed by" picker).
  FundingReceipts: `
    query FundingReceipts($first: Int!, $after: String, $confirmedBy: String) {
      orgHypercertsFundingReceipt(
        first: $first
        after: $after
        confirmedBy: $confirmedBy
      ) {
        totalCount
        edges {
          cursor
          node {
            uri
            cid
            did
            createdAt
            occurredAt
            amount
            currency
            from {
              __typename
              ... on AppCertifiedDefsDid { did }
              ... on OrgHypercertsFundingReceiptText { value }
            }
            to {
              __typename
              ... on AppCertifiedDefsDid { did }
              ... on OrgHypercertsFundingReceiptText { value }
            }
            for { uri cid }
            attestations { role did }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Funding receipts for a single activity — backs the activity detail
  // page's Funding tab + overview preview. Same node shape as
  // FundingReceipts above, but filtered to receipts whose `for` strongRef
  // points at the given activity URI (`where: { for: { eq: $forUri } }`).
  // Both `from` and `to` are unions (AppCertifiedDefsDid account /
  // OrgHypercertsFundingReceiptText free-text); on this surface text
  // parties are surfaced (wallet addresses) rather than blanked.
  FundingReceiptsForActivity: `
    query FundingReceiptsForActivity(
      $forUri: String!
      $first: Int!
      $after: String
    ) {
      orgHypercertsFundingReceipt(
        first: $first
        after: $after
        where: { for: { eq: $forUri } }
      ) {
        totalCount
        edges {
          cursor
          node {
            uri
            cid
            did
            createdAt
            occurredAt
            amount
            currency
            from {
              __typename
              ... on AppCertifiedDefsDid { did }
              ... on OrgHypercertsFundingReceiptText { value }
            }
            to {
              __typename
              ... on AppCertifiedDefsDid { did }
              ... on OrgHypercertsFundingReceiptText { value }
            }
            for { uri cid }
            attestations { role did }
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
      $sortBy: FollowerEventsSort
    ) {
      followerEvents(
        authors: $authors
        first: $first
        after: $after
        kinds: $kinds
        sortBy: $sortBy
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
      $activityExcludeLabels: [String!]
      $activityIncludeLabels: [String!]
    ) {
      activities: orgHypercertsClaimActivity(
        first: ${MAX_URI_LIST_PER_KIND}
        where: { uri: { in: $activityUris } }
        labels: $activityIncludeLabels
        excludeLabels: $activityExcludeLabels
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
              ... on OrgHypercertsWorkscopeCel { expression }
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
            shortDescription
            subjects {
              __typename
              ... on ComAtprotoRepoStrongRef { uri cid }
            }
            content {
              __typename
              ... on OrgHypercertsDefsUri { uri }
              ... on OrgHypercertsDefsSmallBlob { blob { ref mimeType } }
            }
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
 * Reads the optional `sortBy` enum for `FollowerEvents`. The indexer
 * accepts `SORT_AT` (default) or `CREATED_AT` (matches the rendered
 * "X ago" order — see magic-indexer#136). Anything else is dropped to
 * null so a manipulated request can't push an unknown enum literal
 * downstream; the indexer then falls back to its server default.
 */
function readFollowerEventsSort(value: unknown): "SORT_AT" | "CREATED_AT" | null {
  if (value === "SORT_AT" || value === "CREATED_AT") return value
  return null
}

/**
 * Reads one of the `*Uris` array variables. Length 0..`maxItems`
 * inclusive — empty arrays pass through because a typical
 * `HydrateFeedPage` call only has events of a few kinds and the
 * unused kinds should be `[]`. The `maxItems` arg lets the
 * `ActivitiesByUris` path accept a larger set than the per-kind
 * hydration arrays (one indexer page = 100 URIs, vs the feed
 * hydration's 50-per-kind page-size cap).
 */
function readUriList(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value)) return null
  if (value.length > maxItems) return null
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") return null
    if (item.length === 0 || item.length > MAX_URI_LEN) return null
    // Defensive prefix check — every consumer of this list passes
    // the values as a GraphQL `$uris` variable (not body-interpolated),
    // so the actual injection risk is zero. Rejecting non-at:// values
    // here makes a manipulated request fail at the proxy with a 400
    // instead of producing an empty result downstream.
    if (!item.startsWith("at://")) return null
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
        authorLabels: readLabelList(vars.authorLabels),
        excludeAuthorLabels: readLabelList(vars.excludeAuthorLabels),
        search: readString(vars.search, MAX_SEARCH_LEN),
      }
    }
    case "ActivitiesByUris": {
      const uris = readUriList(vars.uris, MAX_URI_LIST_PER_KIND)
      if (uris === null) return null
      return {
        uris,
        labels: readLabelList(vars.labels),
        excludeLabels: readLabelList(vars.excludeLabels),
        authorLabels: readLabelList(vars.authorLabels),
        excludeAuthorLabels: readLabelList(vars.excludeAuthorLabels),
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
    case "UserActivityCount": {
      const did = readDid(vars.did)
      if (!did) return null
      return { did }
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
    case "ProjectsContainingCert": {
      const certUri = readString(vars.certUri, MAX_URI_LEN)
      if (!certUri || !certUri.startsWith("at://")) return null
      return {
        certUri,
        first: clampFirst(vars.first, MAX_FIRST, 50),
      }
    }
    case "Projects": {
      const authors = readOptionalDidList(vars.authors)
      return {
        first: clampFirst(vars.first, MAX_FIRST, 24),
        after: readString(vars.after, MAX_AFTER_LEN),
        authors: authors === undefined ? null : authors,
        authorLabels: readLabelList(vars.authorLabels),
        excludeAuthorLabels: readLabelList(vars.excludeAuthorLabels),
        search: readString(vars.search, MAX_SEARCH_LEN),
      }
    }
    case "NetworkActors": {
      return {
        first: clampFirst(vars.first, MAX_FIRST, 20),
        after: readString(vars.after, MAX_AFTER_LEN),
        search: readString(vars.search, MAX_SEARCH_LEN),
        authorLabels: readLabelList(vars.authorLabels),
        excludeAuthorLabels: readLabelList(vars.excludeAuthorLabels),
      }
    }
    case "OrganizationDids": {
      return {
        first: clampFirst(vars.first, MAX_FIRST, 20),
        after: readString(vars.after, MAX_AFTER_LEN),
      }
    }
    case "NetworkActorsByKind": {
      // `isOrganization` is non-nullable on the upstream op (the
      // indexer rejects `eq: null`); reject missing / non-boolean
      // inputs so the route's contract matches the upstream's.
      if (typeof vars.isOrganization !== "boolean") return null
      return {
        first: clampFirst(vars.first, MAX_FIRST, 20),
        after: readString(vars.after, MAX_AFTER_LEN),
        isOrganization: vars.isOrganization,
        search: readString(vars.search, MAX_SEARCH_LEN),
        authorLabels: readLabelList(vars.authorLabels),
        excludeAuthorLabels: readLabelList(vars.excludeAuthorLabels),
      }
    }
    case "OrganizationDidsByLabel": {
      return {
        first: clampFirst(vars.first, MAX_FIRST, 100),
        after: readString(vars.after, MAX_AFTER_LEN),
        labels: readLabelList(vars.labels),
        excludeLabels: readLabelList(vars.excludeLabels),
      }
    }
    case "NetworkActorsByDids": {
      // Reuse the author-list reader: same shape (DID list, ≤500),
      // same defensive truncation. Empty list is rejected — the
      // op is meaningless without a target set.
      const dids = readAuthorList(vars.dids)
      if (dids === null || dids.length === 0) return null
      return { dids }
    }
    case "OrganizationDidsForSet": {
      // Same shape as `NetworkActorsByDids`: a DID-set narrowing
      // op. Returns just the org-DID subset; consumers chunk to
      // stay under the upstream `first: 100` cap.
      const dids = readAuthorList(vars.dids)
      if (dids === null || dids.length === 0) return null
      return { dids }
    }
    case "DidsByKindInSet": {
      // DID-set narrowing + kind filter. Same validation as the
      // OrganizationDidsForSet op above, plus a required boolean
      // for the kind (graphql-go rejects `eq: null`, so we don't
      // accept undefined here — callers pick "people" or
      // "organizations" explicitly).
      const dids = readAuthorList(vars.dids)
      if (dids === null || dids.length === 0) return null
      if (typeof vars.isOrganization !== "boolean") return null
      return { dids, isOrganization: vars.isOrganization }
    }
    case "ActorWorkspaceCounts": {
      const did = readDid(vars.did)
      if (!did) return null
      return { did }
    }
    case "FundingReceipts": {
      // Paginated read. Clamp `first` like the other paginated ops;
      // `after` is the opaque cursor. `confirmedBy` is an optional
      // third-party-attestor DID filter (magic-indexer #214) — forwarded
      // only when it's a valid DID, otherwise null ("no filter").
      return {
        first: clampFirst(vars.first, MAX_FIRST, 50),
        after: readString(vars.after, MAX_AFTER_LEN),
        confirmedBy: readDid(vars.confirmedBy),
      }
    }
    case "FundingReceiptsForActivity": {
      // Required `forUri` — a single at:// activity URI to filter by.
      // Mirrors the URI validation the ProjectsContainingCert op uses.
      const forUri = readString(vars.forUri, MAX_URI_LEN)
      if (!forUri || !forUri.startsWith("at://")) return null
      return {
        forUri,
        first: clampFirst(vars.first, MAX_FIRST, 50),
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
    case "EvaluatorEndorsements": {
      // Same cap as `authors` on FollowerEvents — defensive, in practice
      // the client passes single-digit lengths from a fixed evaluator list.
      const evaluators = readAuthorList(vars.evaluators)
      if (evaluators === null) return null
      if (evaluators.length === 0) return null
      return {
        evaluators,
        first: clampFirst(vars.first, 100, 50),
        after: readString(vars.after, MAX_AFTER_LEN),
      }
    }
    case "FollowerEvents": {
      const authors = readAuthorList(vars.authors)
      if (authors === null) return null
      const kinds = readKindList(vars.kinds)
      if (kinds === null) return null
      // Allowlisted enum — anything else gets stripped to null so the
      // indexer falls back to its default (SORT_AT). Strict on shape:
      // a malformed value is suspicious enough to drop, not coerce.
      const sortBy = readFollowerEventsSort(vars.sortBy)
      return {
        authors,
        first: clampFirst(vars.first, MAX_FEED_PAGE_SIZE, 20),
        after: readString(vars.after, MAX_AFTER_LEN),
        kinds: kinds ?? null,
        sortBy,
      }
    }
    case "HydrateFeedPage": {
      const activityUris = readUriList(vars.activityUris, MAX_URI_LIST_PER_KIND)
      const collectionUris = readUriList(vars.collectionUris, MAX_URI_LIST_PER_KIND)
      const badgeAwardUris = readUriList(vars.badgeAwardUris, MAX_URI_LIST_PER_KIND)
      const evaluationUris = readUriList(vars.evaluationUris, MAX_URI_LIST_PER_KIND)
      const measurementUris = readUriList(vars.measurementUris, MAX_URI_LIST_PER_KIND)
      const hyperboardUris = readUriList(vars.hyperboardUris, MAX_URI_LIST_PER_KIND)
      const attachmentUris = readUriList(vars.attachmentUris, MAX_URI_LIST_PER_KIND)
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
      // Optional inclusion / exclusion filter for the hyperlabel-style
      // cert labels (`high-quality` / `standard` / `draft` /
      // `likely-test`). Permissive reader — null when omitted or
      // invalid; the GraphQL query treats null as "no filter" on each
      // side. The client picks ONE of the two modes:
      //   - excludeLabels: include unlabeled records, drop the listed
      //     tiers (the home-feed default).
      //   - includeLabels: only records carrying one of the listed
      //     tiers pass; unlabeled records do not. Used when the
      //     "Not labeled yet" checkbox is unchecked.
      const activityExcludeLabels = readLabelList(vars.activityExcludeLabels)
      const activityIncludeLabels = readLabelList(vars.activityIncludeLabels)
      return {
        activityUris,
        collectionUris,
        badgeAwardUris,
        evaluationUris,
        measurementUris,
        hyperboardUris,
        attachmentUris,
        activityExcludeLabels,
        activityIncludeLabels,
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

  const rateDenied = await enforceRateLimit(LIMITER, clientIp(request))
  if (rateDenied) return rateDenied

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
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_SIZE) {
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

  // Bypass the indexer's per-IP `/graphql` rate limiter (magic-indexer
  // R-7): the app's own proxied traffic should never be throttled.
  // Mirrors `resolve-did`; the header is only attached when
  // `INDEXER_RATELIMIT_BYPASS_KEY` is set, so the public default stays
  // limiter-eligible and unset envs are a no-op.
  const bypassKey = process.env.INDEXER_RATELIMIT_BYPASS_KEY
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (bypassKey) headers["X-RateLimit-Bypass"] = bypassKey

  try {
    const upstream = await fetch(UPSTREAM_INDEXER_URL, {
      method: "POST",
      headers,
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
