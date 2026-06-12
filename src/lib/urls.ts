/**
 * Central URL builder + parser for the app's handle-forward routing scheme.
 *
 * The scheme (see docs/.../plan): the **handle** is what we display and link
 * internally; the **DID** is the durable form we hand out when *sharing*,
 * because it can't rot when a handle is reassigned.
 *
 *   profile (shown)    /alice.eco
 *   profile (durable)  /did:plc:abc
 *   record  (shown)    /alice.eco/activity/{rkey}
 *   record  (durable)  /did:plc:abc/activity/{rkey}
 *
 * Identifiers are URL-safe by construction (handles are domains, DIDs use
 * `:` which is a legal path char per RFC 3986, rkeys are TIDs), so we do NOT
 * percent-encode them — that's what kept the old `did%3Aplc%3A…` URLs ugly.
 * This matches how bsky.app and pdsls.dev render DIDs in the path verbatim.
 */

// ---------------------------------------------------------------------------
// Record types  <->  AT Protocol collections (single source of truth)
// ---------------------------------------------------------------------------

/** Friendly URL segment -> the collection (NSID) it addresses. */
export const COLLECTION_BY_TYPE = {
  activity: "org.hypercerts.claim.activity",
  // `org.hypercerts.collection` is also used for endorsement lists
  // (type "list:endorsements"); only the project variant gets a /project URL.
  project: "org.hypercerts.collection",
} as const

export type RecordType = keyof typeof COLLECTION_BY_TYPE

/** Reverse map: collection (NSID) -> friendly URL segment. */
export const TYPE_BY_COLLECTION: Readonly<Record<string, RecordType>> = {
  "org.hypercerts.claim.activity": "activity",
  "org.hypercerts.collection": "project",
}

export function isRecordType(value: string): value is RecordType {
  return Object.prototype.hasOwnProperty.call(COLLECTION_BY_TYPE, value)
}

export function collectionForType(type: RecordType): string {
  return COLLECTION_BY_TYPE[type]
}

/** Map a collection NSID to its friendly segment, or null if it has no page. */
export function typeForCollection(collection: string): RecordType | null {
  return TYPE_BY_COLLECTION[collection] ?? null
}

// ---------------------------------------------------------------------------
// Actor parsing + reserved routes (root-level disambiguation)
// ---------------------------------------------------------------------------

/**
 * Top-level app routes. The root `[actor]` segment must never be one of
 * these. Because AT Protocol handles are domains (always contain a dot) and
 * these are bare words (never a dot), the dot alone disambiguates — this set
 * is the documented invariant and a defensive guard. ANY new top-level route
 * MUST be a dotless word, or it will shadow / be shadowed by a real handle.
 */
export const RESERVED_ROUTES: ReadonlySet<string> = new Set([
  "home",
  "welcome",
  "create",
  "explore",
  "profile",
  "groups",
  "apps",
  "endorsements",
  "workspace",
  "settings",
  "about",
  "privacy",
  "terms",
  "dsa",
  "imprint",
  "oauth",
  "dev",
  "api",
  // Legacy record-route prefixes kept as redirect stubs.
  "activity",
  "project",
  // pdsls-style at-uri prefix handled by middleware.
  "at",
])

export type ActorKind = "handle" | "did" | "invalid"

export function isDid(value: string): boolean {
  return value.startsWith("did:")
}

/**
 * Classify a root URL segment as a handle, a DID, or invalid.
 * Decodes once (defensive — a legacy link may still arrive percent-encoded).
 */
export function parseActor(segment: string): { kind: ActorKind; value: string } {
  let value = segment
  try {
    value = decodeURIComponent(segment)
  } catch {
    // Malformed escape — fall through with the raw value.
  }

  if (isDid(value)) return { kind: "did", value }

  const looksLikeHandle =
    value.includes(".") && !/[/\s]/.test(value) && !RESERVED_ROUTES.has(value)
  if (looksLikeHandle) return { kind: "handle", value }

  return { kind: "invalid", value }
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/** In-app profile link. `actor` is a handle (preferred) or a DID. */
export function profileUrl(actor: string): string {
  return `/${actor}`
}

/** In-app record link. `actor` is a handle (preferred) or a DID. */
export function recordUrl(actor: string, type: RecordType, rkey: string): string {
  return `/${actor}/${type}/${rkey}`
}

/** Convenience builders for the two concrete record types. */
export function activityUrl(actor: string, rkey: string): string {
  return recordUrl(actor, "activity", rkey)
}
export function projectUrl(actor: string, rkey: string): string {
  return recordUrl(actor, "project", rkey)
}

/**
 * Build an in-app record link straight from an at:// URI, mapping the
 * collection to its friendly segment. Returns null for collections without
 * a record page. `actor` defaults to the URI's DID (durable); pass a handle
 * to render the pretty form.
 */
export function recordUrlFromAtUri(uri: string, actor?: string): string | null {
  const parsed = parseAtUri(uri)
  if (!parsed) return null
  const type = typeForCollection(parsed.collection)
  if (!type) return null
  return recordUrl(actor ?? parsed.did, type, parsed.rkey)
}

// --- Durable (share) variants — always the DID form ------------------------

/** Absolute, DID-based profile URL for sharing. */
export function shareProfileUrl(did: string, origin: string): string {
  return `${origin}${profileUrl(did)}`
}

/** Absolute, DID-based record URL for sharing. */
export function shareRecordUrl(
  did: string,
  type: RecordType,
  rkey: string,
  origin: string,
): string {
  return `${origin}${recordUrl(did, type, rkey)}`
}

// ---------------------------------------------------------------------------
// AT-URI parsing (absorbs the old src/lib/atproto/activity-uri.ts helpers)
// ---------------------------------------------------------------------------

export interface ParsedAtUri {
  did: string
  collection: string
  rkey: string
}

/** Parse a canonical `at://did/collection/rkey` URI. Null if malformed. */
export function parseAtUri(uri: string): ParsedAtUri | null {
  if (!uri.startsWith("at://")) return null
  const parts = uri.slice(5).split("/")
  if (parts.length !== 3) return null
  const [did, collection, rkey] = parts
  if (!did || !collection || !rkey) return null
  return { did, collection, rkey }
}

/** Build a canonical at:// URI from parts. */
export function buildAtUri(did: string, collection: string, rkey: string): string {
  return `at://${did}/${collection}/${rkey}`
}

/**
 * Parse a *pasted* pdsls-style path into its at-uri parts. Tolerates the
 * several shapes the prefix can arrive in:
 *   /at://did:plc:…/coll/rkey   (literal — may be normalized by the host)
 *   /at:/did:plc:…/coll/rkey    (one slash collapsed)
 *   /at/did:plc:…/coll/rkey     (single-slash, host-safe form)
 * Returns null when the path isn't an at-uri or lacks a DID authority.
 */
export function parsePastedAtUri(pathname: string): ParsedAtUri | null {
  const stripped = pathname.replace(/^\/+/, "")
  const m = /^at(?::\/\/|:\/|:|\/)(.+)$/.exec(stripped)
  if (!m) return null
  const parts = m[1].split("/").filter(Boolean)
  if (parts.length < 3) return null
  const [did, collection, ...rest] = parts
  if (!isDid(did)) return null
  return { did, collection, rkey: rest.join("/") }
}
