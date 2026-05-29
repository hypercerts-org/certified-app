/**
 * localStorage-backed drafts for inline-edit surfaces that hit a
 * same-field conflict during a swapRecord save (issue #71). When
 * the silent-rebase path can't auto-merge because the user's draft
 * touches a field that ALSO changed on the server, the save
 * handler:
 *
 *   1. Persists `drafts` here keyed by `(viewerDid, collection, rkey)`.
 *   2. Surfaces a banner asking the user to refresh.
 *   3. After refresh, the edit form mounts in view mode; a "Restore
 *      draft" affordance offers to repopulate the form from the
 *      stored draft.
 *
 * Key shape: `swap-draft:${viewerDid}:${collection}:${rkey}`.
 * - Includes `viewerDid` to prevent cross-account leakage on shared
 *   browsers (per round-1 security review H10).
 * - Includes `collection` so two different record types under the
 *   same rkey don't collide.
 *
 * Storage cadence: write on conflict only (NOT on every keystroke
 * — see round-1 atproto review N7). Cleared on successful save and
 * on logout (`clearAllDraftsForViewer`).
 *
 * Quota: localStorage is ~5 MB per origin. A single draft (title +
 * shortDescription + a linearDocument description) is typically a
 * few KB. Multi-draft accumulation across many records is theoretical
 * — we only write on conflict, which is rare, and clear on success.
 */

const KEY_PREFIX = "swap-draft:"

function buildKey(
  viewerDid: string,
  collection: string,
  rkey: string,
): string {
  return `${KEY_PREFIX}${viewerDid}:${collection}:${rkey}`
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    // Storage access can throw in privacy-mode browsers / iframes.
    return null
  }
}

export function saveDraft<T>(
  viewerDid: string,
  collection: string,
  rkey: string,
  drafts: T,
): void {
  const storage = safeLocalStorage()
  if (!storage) return
  try {
    storage.setItem(
      buildKey(viewerDid, collection, rkey),
      JSON.stringify({ savedAt: Date.now(), drafts }),
    )
  } catch (err) {
    // Quota exceeded, etc. Silently swallow — the conflict banner
    // will still tell the user their work is lost.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[swap-drafts] saveDraft failed", err)
    }
  }
}

export function loadDraft<T>(
  viewerDid: string,
  collection: string,
  rkey: string,
): { savedAt: number; drafts: T } | null {
  const storage = safeLocalStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(buildKey(viewerDid, collection, rkey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: unknown; drafts?: T }
    if (typeof parsed.savedAt !== "number") return null
    return { savedAt: parsed.savedAt, drafts: parsed.drafts as T }
  } catch {
    return null
  }
}

export function clearDraft(
  viewerDid: string,
  collection: string,
  rkey: string,
): void {
  const storage = safeLocalStorage()
  if (!storage) return
  try {
    storage.removeItem(buildKey(viewerDid, collection, rkey))
  } catch {
    // Ignore — non-fatal.
  }
}

/**
 * Purge every draft scoped to a given viewer DID. Called from the
 * auth-context logout path so a session change doesn't leave the
 * previous viewer's pending drafts accessible to whoever signs in
 * next on the same browser.
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
