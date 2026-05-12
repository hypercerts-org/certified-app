import type { Group } from "./types"

/**
 * Single source of truth for the URL we navigate to after the user
 * switches actor in the account switcher.
 *
 * Personal → "/" (which redirects to the user's profile)
 * Group    → "/groups/<encoded-did>"
 *
 * The DID is encoded defensively. `did:plc:abc` and `did:web:example.com`
 * round-trip through Next.js dynamic segments unchanged, but a `did:web`
 * with port-style suffixes can contain segments that need escaping, and
 * the rest of the codebase encodes handles/dids consistently.
 */
export function resolvePostSwitchPath(next: Group | null): string {
  if (!next) return "/"
  return `/groups/${encodeURIComponent(next.groupDid)}`
}
