/**
 * Trusted funding sources: accounts whose funding receipts the app shows by
 * default, because they processed the payment themselves and published a
 * receipt for it (a platform such as Ma Earth). A receipt one of them
 * published counts as recorded, even though neither the funder nor the
 * recipient wrote it.
 *
 * This is a curated list in code for now. When there is a second source, it
 * moves to a `list:accounts` record read the way `useTrustedEvaluators` reads
 * the evaluator list, so adding a source needs no deploy. Kept apart from the
 * trusted evaluators on purpose: evaluators judge work, sources process
 * payments.
 */

export interface TrustedFundingSource {
  did: string
  /** Display name used in labels before the profile has loaded. */
  name: string
}

export const MA_EARTH_DID = "did:plc:7ffezlhobzihdt3nbazysgvr"

export const TRUSTED_FUNDING_SOURCES: readonly TrustedFundingSource[] = [
  { did: MA_EARTH_DID, name: "Ma Earth" },
]

const TRUSTED_DIDS = new Set(TRUSTED_FUNDING_SOURCES.map((s) => s.did))

export function isTrustedFundingSource(did: string | null | undefined): boolean {
  return !!did && TRUSTED_DIDS.has(did)
}

/** The label for the trusted-source bucket: the source's own name while there
 *  is one source, a generic name once there are several. */
export function trustedSourcesLabel(): string {
  return TRUSTED_FUNDING_SOURCES.length === 1
    ? TRUSTED_FUNDING_SOURCES[0].name
    : "Trusted sources"
}
