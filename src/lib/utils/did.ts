const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9._:%-]+)$/

export function isValidDid(did: string): boolean {
  return DID_RE.test(did)
}

export function isDid(s: string): boolean {
  return s.startsWith("did:plc:") || s.startsWith("did:web:")
}

/**
 * Shortens a long DID for display, keeping the first 16 and last 6
 * characters separated by an ellipsis. DIDs of 24 chars or fewer are
 * returned unchanged.
 */
export function truncateDid(did: string): string {
  return did.length > 24 ? `${did.slice(0, 16)}…${did.slice(-6)}` : did
}
