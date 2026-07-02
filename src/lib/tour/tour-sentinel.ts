/**
 * Tracks the product walk-through state per DID. Two independent flags,
 * both keyed by DID so account switches don't bleed tour state across
 * identities, both stored in localStorage (not in any PDS record):
 *
 *  - "completed": the user has finished or skipped the walk-through. The
 *    auto-trigger is suppressed once this is set. Cleared only by an
 *    explicit restart from /help would NOT clear it — restart just runs
 *    the tour again without touching the flag.
 *  - "pending": the user just finished profile onboarding and the tour
 *    should auto-start on the next load. Onboarding success does a full
 *    page reload, so the in-memory "just finished" signal is lost — this
 *    flag carries the intent across that reload. The provider clears it
 *    as soon as it auto-starts.
 *
 * Mirrors the guard + try/catch shape of the onboarding dismissed
 * sentinel (private-mode / quota safe; SSR no-ops).
 */

const COMPLETED_PREFIX = "certified:tour-completed:"
const PENDING_PREFIX = "certified:tour-pending:"

function completedKey(did: string): string {
  return `${COMPLETED_PREFIX}${did}`
}

function pendingKey(did: string): string {
  return `${PENDING_PREFIX}${did}`
}

export function isTourCompleted(did: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(completedKey(did)) === "1"
  } catch {
    return false
  }
}

export function markTourCompleted(did: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(completedKey(did), "1")
  } catch {
    // private-mode / quota — best effort; the tour reappearing once more
    // is a safer fallback than crashing.
  }
}

export function isTourPending(did: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(pendingKey(did)) === "1"
  } catch {
    return false
  }
}

export function markTourPending(did: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(pendingKey(did), "1")
  } catch {
    /* swallow */
  }
}

export function clearTourPending(did: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(pendingKey(did))
  } catch {
    /* swallow */
  }
}
