import {
  DEFAULT_HIDDEN_CERT_LABELS,
  DEFAULT_HIDDEN_ORG_LABELS,
} from "@/lib/atproto/labels"
import { MAX_URI_LIST_PER_KIND } from "./variables"

/**
 * Server-held GraphQL query strings for the indexer proxy — the
 * allowlist half of the trust boundary described in ./route.ts.
 * Pure module-level constants: the query text embeds the shared
 * label-exclusion policy and the MAX_URI_LIST_PER_KIND page size
 * (single-sourced in ./variables.ts — changing it there changes both
 * the validator cap and the on-wire page size).
 */

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
 * branch in ./variables.ts or the request 400s on unknown variables.
 */
export const OPERATIONS: Record<string, string> = {
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

  // Every badge award of one `badgeType` across the network — backs the
  // /endorsement-graph page, which scans once per type ("endorsement" and
  // "award"; the proxy allowlists the value). Returns the directed edge
  // (issuer `did` → `subject`) plus the issuer's denormalised actor
  // profile (same `issuer { ... }` join as ReceivedEndorsements, drops a
  // per-issuer resolve fan-out). The subject union carries the DID for
  // account-targeted awards and the strong-ref `uri` for record-targeted
  // ones (award-typed badges usually point at records; the at:// authority
  // identifies the owning account). Subjects that never issued an award
  // have no inline profile here, so the client resolves those DIDs via
  // NetworkActorsByDids. `excludeAuthorLabels` hides awards authored by
  // likely-test accounts, mirroring AwardCount so the graph matches the
  // public counters. Paginated; the client unions pages up to a cap.
  AllEndorsements: `
    query AllEndorsements($badgeType: String!, $first: Int!, $after: String) {
      appCertifiedBadgeAward(
        where: { badgeType: { eq: $badgeType } }
        excludeAuthorLabels: ${JSON.stringify([...DEFAULT_HIDDEN_ORG_LABELS])}
        first: $first
        after: $after
      ) {
        edges {
          cursor
          node {
            uri
            createdAt
            note
            did
            subject {
              __typename
              ... on AppCertifiedDefsDid { did }
              ... on ComAtprotoRepoStrongRef { uri }
            }
            issuer { did handle displayName avatarCid pds }
            response { state }
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
  // shortDescription, createdAt, avatar, banner, items[] (avatar feeds
  // the thumb slot's avatar-first precedence). The indexer does NOT
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
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  // Batch fetch of specific collection URIs in one round-trip — the
  // getRecords-by-uri form for surfaces that already hold strongRefs
  // to org.hypercerts.collection records (project items) and would
  // otherwise fan out one getRecord per URI. Same
  // `where: { uri: { in: $uris } }` shape as the HydrateFeedPage
  // collections branch, and the same node selection so consumers can
  // reuse the existing CollectionRecord rendering. The indexer caps
  // the `in` list at MAX_URI_LIST_PER_KIND (50) entries; callers
  // chunk larger sets.
  CollectionsByUris: `
    query CollectionsByUris($uris: [String!]!) {
      orgHypercertsCollection(
        first: ${MAX_URI_LIST_PER_KIND}
        where: { uri: { in: $uris } }
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
    query FundingReceipts(
      $first: Int!
      $after: String
      $authorLabels: [String!]
      $excludeAuthorLabels: [String!]
      $confirmedBy: String
    ) {
      orgHypercertsFundingReceipt(
        first: $first
        after: $after
        authorLabels: $authorLabels
        excludeAuthorLabels: $excludeAuthorLabels
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
            paymentRail
            paymentNetwork
            transactionId
            notes
            matchingReceipt { uri cid }
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
            paymentRail
            paymentNetwork
            transactionId
            notes
            matchingReceipt { uri cid }
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
