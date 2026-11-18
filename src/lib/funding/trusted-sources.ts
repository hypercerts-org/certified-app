/**
 * Trusted funding sources: accounts whose funding receipts the app shows by
 * default, because they processed the payment themselves and published a
 * receipt for it (platforms such as Ma Earth and GainForest). A receipt one
 * of them published counts as recorded, even though neither the funder nor
 * the recipient wrote it.
 *
 * Each source is its own choice in the "Confirmed by" filter, named by
 * `name` (never a generic "Trusted sources"), and its receipts are read from
 * its own repository when the /funding dataset is built.
 *
 * This is a curated list in code for now, so adding a source needs a deploy.
 * It may later move to a `list:accounts` record read the way
 * `useTrustedEvaluators` reads the evaluator list. Kept apart from the
 * trusted evaluators on purpose: evaluators judge work, sources process
 * payments.
 */

export interface TrustedFundingSource {
  /** Short, stable id: the source's choice in the "Confirmed by" filter and
   *  its value in `?confirmedRoles=`. Never change one once shipped. */
  key: string
  did: string
  /** The name the funding pages call the source by (its chip, "recorded
   *  by ...", the Flow's column), whatever its profile is called. */
  name: string
}

export const MA_EARTH_DID = "did:plc:7ffezlhobzihdt3nbazysgvr"
/** GainForest, publishing as heisenberg.climateai.org. */
export const GAINFOREST_DID = "did:plc:edod7rboajioq3jbyxsgeicc"

/** In the order the filter lists them. The /funding dataset gives each its
 *  own bucket bit by position (`sourceBucket`), so adding one changes the
 *  dataset's cache key (`FUNDING_DATASET_VERSION`) on its own. */
export const TRUSTED_FUNDING_SOURCES = [
  { key: "ma-earth", did: MA_EARTH_DID, name: "Ma Earth" },
  { key: "gainforest", did: GAINFOREST_DID, name: "GainForest" },
] as const satisfies readonly TrustedFundingSource[]

/** One of the sources above, with its key as a literal. */
export type KnownTrustedSource = (typeof TRUSTED_FUNDING_SOURCES)[number]
export type TrustedSourceKey = KnownTrustedSource["key"]

const BY_DID = new Map<string, KnownTrustedSource>(TRUSTED_FUNDING_SOURCES.map((s) => [s.did, s]))
const BY_KEY = new Map<string, KnownTrustedSource>(TRUSTED_FUNDING_SOURCES.map((s) => [s.key, s]))

export function isTrustedFundingSource(did: string | null | undefined): boolean {
  return !!did && BY_DID.has(did)
}

/** The trusted source an account is, if it is one. */
export function trustedFundingSource(did: string | null | undefined): KnownTrustedSource | undefined {
  return did ? BY_DID.get(did) : undefined
}

/** The trusted source with this filter key. */
export function trustedSourceByKey(key: string): KnownTrustedSource | undefined {
  return BY_KEY.get(key)
}

/** Names as a list: "Ma Earth", "Ma Earth and GainForest", "A, B or C". */
export function joinNames(names: readonly string[], conjunction: "and" | "or" = "and"): string {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} ${conjunction} ${names[names.length - 1]}`
}

/** Every trusted source by name: "Ma Earth and GainForest". */
export function trustedSourceNames(conjunction: "and" | "or" = "and"): string {
  return joinNames(
    TRUSTED_FUNDING_SOURCES.map((s) => s.name),
    conjunction,
  )
}
