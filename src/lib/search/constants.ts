/**
 * Shared search tunables. Previously `SEARCH_DEBOUNCE_MS` was duplicated
 * verbatim in `global-search.tsx` and `cert-search.tsx`; the unified
 * search brain (`useUnifiedSearch`) and both surfaces now import one
 * source so the cadence can't drift.
 */

/** Keystroke debounce before a search fan-out fires, in ms. */
export const SEARCH_DEBOUNCE_MS = 250

/**
 * Fetch-wide / show-narrow: how many candidates to request per source
 * so client re-ranking has something to reorder. The indexer returns
 * keyset/recency order, so fetching only the display count would just
 * re-surface the same recency-buried order. Request this many, rank,
 * then slice to the display cap.
 */
export const CANDIDATE_FETCH_SIZE = 25

/** Default rows shown per section after ranking. */
export const SECTION_DISPLAY_LIMIT = 6
