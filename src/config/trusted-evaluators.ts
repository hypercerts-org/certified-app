/**
 * Trusted evaluator DIDs whose endorsement records feed the Certified
 * "Trusted" feed filter. Committed to this repository as the authoritative
 * source of truth. Changes go through normal PR review.
 *
 * Curation policy:
 *   - Each entry is a DID that Certified considers a credible
 *     endorser of hypercert work. See
 *     docs/architecture/0001-trusted-evaluator-feed-filter.md for the
 *     design context.
 *   - Entries are additive only by default. Removal of an existing entry
 *     is a user-visible action (existing users who had that evaluator
 *     toggled on will silently lose it on next page load) and should be
 *     discussed before merging.
 *   - New entries are ON by default for new users and OFF by default for
 *     existing users (preserving their explicit opt-in set).
 *
 * The list is a flat array of DID strings -- no names, avatars, or
 * metadata. The app resolves display information for each evaluator at
 * runtime via the existing author-info resolution mechanism.
 */
export const TRUSTED_EVALUATORS: ReadonlyArray<string> = [
  "did:plc:s4puetfspot742ai7y4otuel",
  "did:plc:xqrmqd4h7f3fpe7ue7qdhp7h",
  "did:plc:qoti4acfmc5wg6zzmtix6hse",
]

/** Pre-computed mutable copy of TRUSTED_EVALUATORS for hooks that need a string[]. */
export const ALL_EVALUATOR_DIDS = [...TRUSTED_EVALUATORS]

/** Stable cache key derived from TRUSTED_EVALUATORS (sorted, comma-joined). */
export const ALL_EVALUATORS_STABLE_KEY = [...TRUSTED_EVALUATORS].sort().join(",")
