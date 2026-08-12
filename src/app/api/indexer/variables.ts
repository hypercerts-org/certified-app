/**
 * Per-operation variable validation for the indexer proxy — the
 * pure half of the trust boundary described in ./route.ts. Every
 * reader here clamps / type-checks client-supplied input against the
 * MAX_* caps below so a manipulated request can't push pathological
 * inputs (10k-element arrays, multi-MB strings) downstream. No
 * request state, no I/O — `buildVariables` is a pure function of
 * (operationName, client variables).
 */

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
export const MAX_URI_LIST_PER_KIND = 50

export type ClientVariables = Record<string, unknown>

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
export function buildVariables(
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
    case "CollectionsByUris": {
      // Batch getRecords-by-uri over collections. Same reader + cap as
      // the per-kind hydration arrays; the empty list is rejected — a
      // batch fetch of nothing is a wasted round-trip, callers skip the
      // call instead (matches NetworkActorsByDids).
      const uris = readUriList(vars.uris, MAX_URI_LIST_PER_KIND)
      if (uris === null || uris.length === 0) return null
      return { uris }
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
      // `after` is the opaque cursor. The optional author-label filters
      // gate receipts by the creator's account (orglabeler) tier so the
      // Funding tab can hide receipts authored by likely-test accounts
      // (magic-indexer#207); `confirmedBy` is an optional third-party-
      // attestor DID filter (magic-indexer #214), forwarded only when it's
      // a valid DID, otherwise null ("no filter").
      return {
        first: clampFirst(vars.first, MAX_FIRST, 50),
        after: readString(vars.after, MAX_AFTER_LEN),
        authorLabels: readLabelList(vars.authorLabels),
        excludeAuthorLabels: readLabelList(vars.excludeAuthorLabels),
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
    case "AllEndorsements": {
      // Paginated network-wide scan, one badge type per pass. Strict
      // allowlist on `badgeType` (defaults to "endorsement" for older
      // clients) — anything else 400s here rather than fanning an
      // arbitrary string out to the indexer. Same clamp shape as the
      // other 100-per-page reads (ReceivedEndorsements).
      const badgeType = vars.badgeType === undefined ? "endorsement" : vars.badgeType
      if (badgeType !== "endorsement" && badgeType !== "award") return null
      return {
        badgeType,
        first: clampFirst(vars.first, MAX_FIRST, 100),
        after: readString(vars.after, MAX_AFTER_LEN),
      }
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
