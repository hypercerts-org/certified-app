/**
 * Helpers for working with AT Protocol activity URIs of the form:
 *   at://did:plc:xxxxx/org.hypercerts.claim.activity/rkey123
 */

const COLLECTION = "org.hypercerts.claim.activity"

export interface ParsedActivityUri {
  did: string
  collection: string
  rkey: string
}

/** Parse any at:// URI into its components. Returns null if malformed. */
export function parseAtUri(uri: string): ParsedActivityUri | null {
  if (!uri.startsWith("at://")) return null
  const parts = uri.slice(5).split("/")
  if (parts.length !== 3) return null
  const [did, collection, rkey] = parts
  if (!did || !collection || !rkey) return null
  return { did, collection, rkey }
}

/** Parse an at:// URI into its components. Returns null if malformed. */
export function parseActivityUri(uri: string): ParsedActivityUri | null {
  return parseAtUri(uri)
}

/** Build the in-app detail URL for an activity record. */
export function activityDetailHref(did: string, rkey: string): string {
  return `/activity/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`
}

/** Convenience: go from an at:// URI straight to the detail URL. */
export function activityDetailHrefFromUri(uri: string): string | null {
  const parsed = parseActivityUri(uri)
  if (!parsed) return null
  if (parsed.collection !== COLLECTION) return null
  return activityDetailHref(parsed.did, parsed.rkey)
}
