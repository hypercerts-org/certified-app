/**
 * Tracks whether a user has explicitly dismissed the first-signin
 * onboarding modal. Keyed by DID so account switches don't bleed
 * dismissal state across identities. Stored in localStorage (not in
 * any PDS record) — the recovery surfaces (profile banner, settings
 * card) intentionally remain visible regardless of this flag; the
 * flag only suppresses the auto-popup so we don't pester the user
 * on every refresh.
 */

const PREFIX = "certified:onboarding-dismissed:"

function key(did: string): string {
  return `${PREFIX}${did}`
}

export function isOnboardingDismissed(did: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(key(did)) === "1"
  } catch {
    return false
  }
}

export function markOnboardingDismissed(did: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key(did), "1")
  } catch {
    // private-mode / quota — best effort; modal will reappear on next
    // session, which is the safer fallback than crashing.
  }
}

export function clearOnboardingDismissed(did: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key(did))
  } catch {
    /* swallow */
  }
}
