import { InvalidSwapError } from "@/lib/atproto/repo-write"
import { computeDirtyFields } from "@/lib/utils/swap-drafts"

/**
 * Generic swap-aware save loop for inline-edit handlers. Wraps a
 * caller's `write(next, swapRecord)` in a 3-retry CID-precondition
 * loop that:
 *
 *   - Catches `InvalidSwapError` (record was modified by another
 *     tab / device between the read and the write).
 *   - Re-reads the record via the caller's `read()` to get a fresh
 *     value + CID.
 *   - Computes the user's "dirty" field set (`drafts` vs the
 *     original `mountSnapshot`) — keys the user actually touched.
 *   - Detects same-field conflicts: any dirty key whose fresh
 *     server value also differs from the mount snapshot.
 *   - If disjoint: rebases (recomputes `next` from fresh + drafts
 *     via the caller's `computeNext`), updates the swap CID, and
 *     retries the save silently.
 *   - If same-field: returns `{ ok: false, reason: "conflict",
 *     conflictingFields }` so the caller can persist drafts to
 *     localStorage and surface the conflict banner.
 *
 * Retry cap is 3 (configurable via `maxRetries`). On the 4th
 * iteration (a livelock — three consecutive disjoint conflicts on
 * a record that keeps moving) we bail out with
 * `{ ok: false, reason: "livelock" }`. Same caller treatment as a
 * same-field conflict: persist drafts + surface the banner.
 *
 * The caller owns:
 *   - localStorage write on conflict (key = `(viewerDid, collection, rkey)`).
 *   - The conflict banner UI.
 *   - Clearing drafts + closing the banner on `ok: true`.
 *
 * Why a generic helper? Each save handler (cert / project / profile
 * / org-marker) has different `read`, `write`, and `computeNext`
 * concretions, but the rebase loop itself is identical. ~30 lines
 * of guard code × 4 surfaces = 120 lines collapsed to one. Round-1
 * code-quality review H13 / shared-hook recommendation N5.
 *
 * Per round-1 atproto review H7 / livelock: each retry MUST re-read.
 * Never retry with a stale CID — that would just re-409 immediately.
 */
export interface SaveWithSwapOptions<TSnapshot, TDrafts> {
  /** Snapshot of the record value at edit-start. Used as the
   *  baseline against which `drafts` is compared to compute dirty
   *  fields. NOT mutated during retries. */
  mountSnapshot: TSnapshot
  /** The CID of the record at edit-start (or after the last
   *  successful rebase). Threaded into the next `write` call as
   *  the swapRecord precondition. */
  initialCid: string
  /** Current draft state. Compared against `mountSnapshot` to
   *  compute the dirty-field set; also passed to `computeNext`
   *  on each retry to recompute the payload. */
  drafts: TDrafts
  /** Build the record body to write from `(serverValue, drafts)`.
   *  Typically `{ ...serverValue, ...edits }`. Called on each
   *  retry with the freshly-read server value. */
  computeNext: (serverValue: TSnapshot, drafts: TDrafts) => TSnapshot
  /** Issue the write. Receives the computed payload + the current
   *  swap CID. Throws `InvalidSwapError` on a CID mismatch. */
  write: (next: TSnapshot, swapRecord: string) => Promise<void>
  /** Re-read the record on conflict. Returns the fresh value +
   *  CID. Implemented per surface — `useProject`'s underlying
   *  `getRecord`, cert detail's, etc. */
  read: () => Promise<{ value: TSnapshot; cid: string }>
  /** Hard cap. Default 3 retries (so up to 4 write attempts). */
  maxRetries?: number
}

export type SaveWithSwapResult<TSnapshot> =
  | { ok: true }
  | {
      ok: false
      reason: "conflict"
      /** Field keys whose draft value AND server value both differ
       *  from the mount snapshot — the silent rebase couldn't
       *  resolve these. Surface in the banner copy. */
      conflictingFields: (keyof TSnapshot)[]
      /** Fresh server value at the time of the conflict, for
       *  surfaces that want to show "their version" inline. */
      latestServerValue: TSnapshot
    }
  | {
      ok: false
      reason: "livelock"
      /** Number of retries before giving up. */
      attempts: number
    }

export async function saveWithSwap<
  TSnapshot extends Record<string, unknown>,
  // `TDrafts` MUST be a subset of `TSnapshot`'s shape: every draft key
  // is also a snapshot key with a compatible value type. This makes
  // the cross-shape contract the conflict-detection step relies on
  // (quality-025) explicit at compile time — a draft carrying a key
  // absent from `TSnapshot` is rejected here rather than silently
  // excluded from conflict detection and auto-rebased over a
  // concurrent server change. The invariant also holds for `read()`:
  // its returned `value` is a full `TSnapshot`, so indexing it by a
  // draft key below is always type-safe.
  TDrafts extends Partial<TSnapshot>,
>(
  opts: SaveWithSwapOptions<TSnapshot, TDrafts>,
): Promise<SaveWithSwapResult<TSnapshot>> {
  const maxRetries = opts.maxRetries ?? 3
  let snapshot = opts.mountSnapshot
  let cid = opts.initialCid
  let attempts = 0

  while (attempts <= maxRetries) {
    try {
      const next = opts.computeNext(snapshot, opts.drafts)
      await opts.write(next, cid)
      return { ok: true }
    } catch (err) {
      if (!(err instanceof InvalidSwapError)) throw err

      attempts++
      if (attempts > maxRetries) {
        return { ok: false, reason: "livelock", attempts }
      }

      // Re-read with fresh CID (must — round-1 atproto H7).
      const fresh = await opts.read()

      // Conflict detection: a same-field conflict exists when the
      // user touched a field AND the fresh server value differs
      // from the mount snapshot on that same field. Disjoint
      // changes auto-rebase silently.
      // `TDrafts extends Partial<TSnapshot>` guarantees every draft key
      // is a snapshot key, so the dirty set is keyed by `keyof TSnapshot`
      // and indexing `mountSnapshot` / `fresh.value` (both `TSnapshot`)
      // by those keys is type-safe without casts.
      const dirty = computeDirtyFields<Partial<TSnapshot>>(
        opts.mountSnapshot,
        opts.drafts,
      ) as (keyof TSnapshot)[]
      const conflictingFields = dirty.filter((key) => {
        return !shallowEqual(opts.mountSnapshot[key], fresh.value[key])
      })

      if (conflictingFields.length > 0) {
        return {
          ok: false,
          reason: "conflict",
          conflictingFields,
          latestServerValue: fresh.value,
        }
      }

      // Disjoint — silent rebase. Update snapshot + cid and retry.
      // mountSnapshot stays fixed (it's the user's edit-start
      // baseline); only the server-side snapshot we feed into
      // computeNext updates.
      snapshot = fresh.value
      cid = fresh.cid
    }
  }
  // Unreachable — the while-loop's exit conditions above always
  // return. Belt-and-suspenders.
  return { ok: false, reason: "livelock", attempts }
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== "object") return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
