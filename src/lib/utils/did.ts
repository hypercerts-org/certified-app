const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9._:%-]+)$/

export function isValidDid(did: string): boolean {
  return DID_RE.test(did)
}

export function isDid(s: string): boolean {
  return s.startsWith("did:plc:") || s.startsWith("did:web:")
}
