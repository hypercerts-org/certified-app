/**
 * Generic per-DID fan-out with error isolation.
 *
 * Runs `fetchOne` in parallel across every DID and returns each DID's
 * results alongside the DID. A failed DID yields an empty list rather
 * than rejecting the whole batch — so one group's PDS being down (or a
 * 400 on a repo with no records of the queried collection) doesn't blank
 * the aggregate. Abort is propagated via the shared `signal`.
 *
 * Used by the read-aggregation surfaces (typed-lists, following,
 * given-endorsements) that need to union a single-DID fetcher across the
 * viewer's managed identities.
 */
export async function fanOut<T>(
  dids: string[],
  fetchOne: (did: string, signal?: AbortSignal) => Promise<T[]>,
  signal?: AbortSignal,
): Promise<Array<{ did: string; items: T[] }>> {
  return Promise.all(
    dids.map(async (did) => {
      try {
        const items = await fetchOne(did, signal)
        return { did, items }
      } catch (err) {
        // Re-throw aborts so the caller can distinguish cancellation from
        // a genuine per-DID failure; swallow everything else to [].
        if (err instanceof DOMException && err.name === "AbortError") throw err
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[fan-out] fetch failed for ${did}:`, err)
        }
        return { did, items: [] as T[] }
      }
    }),
  )
}
