/**
 * Helpers for the swapRecord save flow (issue #71): the stateless
 * dirty-field diffing `saveWithSwap` runs at save time, plus the
 * logout purge for legacy conflict drafts.
 *
 * The draft save/restore half of the original design (persist the
 * user's edits to localStorage on a same-field conflict, offer a
 * "Restore draft" after refresh) was removed — the restore affordance
 * was never built, so the writes were dead weight. Older builds did
 * write those keys, so `clearAllDraftsForViewer` keeps purging them
 * on logout.
 *
 * Legacy key shape: `swap-draft:${viewerDid}:${collection}:${rkey}`.
 * - Includes `viewerDid` to prevent cross-account leakage on shared
 *   browsers (per round-1 security review H10).
 * - Includes `collection` so two different record types under the
 *   same rkey don't collide.
 */

const KEY_PREFIX = "swap-draft:"

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    // Storage access can throw in privacy-mode browsers / iframes.
    return null
  }
}

/**
 * Purge every draft scoped to a given viewer DID. Called from the
 * auth-context logout path so a session change doesn't leave a
 * previous viewer's drafts (written by older builds) accessible to
 * whoever signs in next on the same browser.
 */
export function clearAllDraftsForViewer(viewerDid: string): void {
  const storage = safeLocalStorage()
  if (!storage) return
  const prefix = `${KEY_PREFIX}${viewerDid}:`
  try {
    const toRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && key.startsWith(prefix)) toRemove.push(key)
    }
    for (const key of toRemove) storage.removeItem(key)
  } catch {
    // Ignore — non-fatal.
  }
}

/**
 * Compute the dirty-field set: keys whose draft value differs from
 * the value at edit-start (the mount snapshot). Used at save time
 * to determine which fields are actually "touched" vs. ride along
 * via spread.
 *
 * Per round-1 code-quality review H11: keep this stateless and
 * recompute at save time. Don't carry a parallel `dirty: Set` state
 * that could drift from the drafts.
 */
export function computeDirtyFields<T extends Record<string, unknown>>(
  snapshot: T,
  drafts: T,
): (keyof T)[] {
  const keys = new Set<keyof T>([
    ...(Object.keys(snapshot) as (keyof T)[]),
    ...(Object.keys(drafts) as (keyof T)[]),
  ])
  const dirty: (keyof T)[] = []
  for (const key of keys) {
    if (!shallowEqual(snapshot[key], drafts[key])) dirty.push(key)
  }
  return dirty
}

/**
 * Shallow value equality — handles primitives, arrays of primitives,
 * and shallow object equality. NOT deep — sufficient for the
 * drafts comparison since drafts store leaves (string, number, null)
 * for the fields that have a "dirty" semantic. linearDocument and
 * other nested structures should be compared with deepEqual at the
 * caller's discretion; this helper treats them as opaque (returns
 * `false` for object identity mismatch which means "changed").
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== "object") return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  // Object / array — compare via JSON serialization. Cheap enough
  // for the small payloads we expect; not safe for circular refs
  // (drafts never carry those).
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
