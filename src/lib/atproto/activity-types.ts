import type { HypercertsUri, HypercertsSmallImage } from "./types"

/** Inline contributor identity */
export interface ContributorIdentity {
  identity: string
}

/** Inline contributor role */
export interface ContributorRole {
  role: string
}

/** AT Protocol strong reference */
export interface StrongRef {
  uri: string
  cid: string
}

/** A contributor to the activity */
export interface ActivityContributor {
  contributorIdentity: ContributorIdentity | StrongRef
  contributionWeight?: string
  contributionDetails?: ContributorRole | StrongRef
}

/** CEL work scope expression */
export interface WorkScopeCel {
  $type?: "org.hypercerts.workscope.cel"
  expression: string
  usedTags: StrongRef[]
  version: string
  createdAt: string
}

/** Free-form work scope string */
export interface WorkScopeString {
  $type?: "org.hypercerts.claim.activity#workScopeString"
  scope: string
}

/** The activity record value matching org.hypercerts.claim.activity.
 *
 *  workScope is typed as unknown because older records store it as a
 *  plain string ("biodiversity, open-source, atproto"), while the new
 *  lexicon stores it as an object (WorkScopeCel or WorkScopeString).
 *  Code that reads it must use `workScopeToLabel()` from activity.ts. */
export interface ClaimActivity {
  $type?: "org.hypercerts.claim.activity"
  title: string
  shortDescription: string
  createdAt: string
  shortDescriptionFacets?: unknown[]
  description?: unknown
  image?: HypercertsUri | HypercertsSmallImage
  contributors?: ActivityContributor[]
  workScope?: WorkScopeCel | WorkScopeString | string | Record<string, unknown>
  startDate?: string
  endDate?: string
  locations?: StrongRef[]
  rights?: StrongRef
}

/** Wrapper from com.atproto.repo.listRecords response */
export interface ActivityRecord {
  uri: string
  cid: string
  value: ClaimActivity
}

/** Paginated listRecords response */
export interface ListActivitiesResponse {
  cursor?: string
  records: ActivityRecord[]
}
