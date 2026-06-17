/**
 * Resilience detector: recognise when the user has pasted a direct
 * IDENTIFIER (an at-URI, a DID, a handle, or an app/pdsls URL) rather
 * than a search term, and offer a one-tap "Jump to" that resolves it
 * WITHOUT the indexer.
 *
 * Why: free-text search depends entirely on the magic-indexer, so a
 * record the indexer hasn't ingested (e.g. on an external PDS — see
 * magic-indexer#224) is undiscoverable by name. But if the user already
 * holds its link/handle/DID, we can navigate straight there via the
 * app's own routing scheme + PDS/`/api/resolve-*`. This is a workaround
 * for people who have the identifier — NOT a name-discovery fix.
 *
 * Pure and synchronous: it only classifies the string and builds the
 * in-app href. Optional profile enrichment (name/avatar) is left to the
 * caller, which should only call `/api/resolve-*` when `resolvable` is
 * true (i.e. the identifier is structurally complete) so we don't fire
 * a resolve on every keystroke of a half-typed handle.
 */

import {
  parseAtUri,
  parsePastedAtUri,
  parseActor,
  isDid,
  isRecordType,
  recordUrl,
  recordUrlFromAtUri,
  profileUrl,
  typeForCollection,
  type ParsedAtUri,
} from "@/lib/urls"

export type SearchIntent =
  | {
      kind: "record"
      /** In-app href to navigate to. */
      href: string
      did: string
      collection: string
      rkey: string
      /** Friendly label, e.g. "Open activity" / "Open project". */
      label: string
      /** Whether the caller may enrich via a resolve call. */
      resolvable: boolean
    }
  | {
      kind: "profile"
      href: string
      /** Handle or DID, as pasted. */
      actor: string
      label: string
      resolvable: boolean
    }

function recordLabel(collection: string): string {
  const type = typeForCollection(collection)
  if (type === "activity") return "Open activity"
  if (type === "project") return "Open project"
  return "Open record"
}

/** Build a record-or-profile intent from parsed at-URI parts. Records
 *  whose collection has no in-app page fall back to the author profile. */
function intentFromAtUri(parsed: ParsedAtUri): SearchIntent {
  const href = recordUrlFromAtUri(`at://${parsed.did}/${parsed.collection}/${parsed.rkey}`)
  if (href) {
    return {
      kind: "record",
      href,
      did: parsed.did,
      collection: parsed.collection,
      rkey: parsed.rkey,
      label: recordLabel(parsed.collection),
      resolvable: true,
    }
  }
  return {
    kind: "profile",
    href: profileUrl(parsed.did),
    actor: parsed.did,
    label: "Go to profile",
    resolvable: true,
  }
}

/** Interpret a URL pathname against the app's routing scheme:
 *  `/{actor}`, `/{actor}/{type}/{rkey}`, or a pasted `/at/...` form. */
function intentFromPathname(pathname: string): SearchIntent | null {
  const pasted = parsePastedAtUri(pathname)
  if (pasted) return intentFromAtUri(pasted)

  const segments = pathname.replace(/^\/+/, "").split("/").filter(Boolean)
  if (segments.length === 0) return null

  const actor = parseActor(segments[0])
  if (actor.kind === "invalid") return null

  if (segments.length >= 3 && isRecordType(segments[1])) {
    const type = segments[1]
    const rkey = segments[2]
    return {
      kind: "record",
      href: recordUrl(actor.value, type, rkey),
      did: actor.kind === "did" ? actor.value : "",
      collection: type,
      rkey,
      label: type === "project" ? "Open project" : "Open activity",
      resolvable: true,
    }
  }

  if (segments.length === 1) {
    return {
      kind: "profile",
      href: profileUrl(actor.value),
      actor: actor.value,
      label: actor.kind === "handle" ? `Go to @${actor.value}` : "Go to profile",
      resolvable: true,
    }
  }
  return null
}

/**
 * Classify `query`. Returns a jump intent when the string is a complete
 * identifier, or null when it's an ordinary search term.
 */
export function parseSearchIntent(query: string): SearchIntent | null {
  const q = query.trim()
  if (!q) return null

  // 1. Canonical at-URI.
  if (q.startsWith("at://")) {
    const parsed = parseAtUri(q)
    return parsed ? intentFromAtUri(parsed) : null
  }

  // 2. Other pasted at-uri shapes (at:/…, at/…) without a leading slash.
  if (/^at[:/]/.test(q)) {
    const pasted = parsePastedAtUri(q)
    return pasted ? intentFromAtUri(pasted) : null
  }

  // 3. A full http(s) URL — interpret its pathname (handles app URLs and
  //    pdsls-style /at/ paths; foreign hosts simply won't match our
  //    scheme and return null).
  if (/^https?:\/\//i.test(q)) {
    try {
      const url = new URL(q)
      return intentFromPathname(url.pathname)
    } catch {
      return null
    }
  }

  // 4. Bare DID.
  if (isDid(q) && !/\s/.test(q)) {
    return {
      kind: "profile",
      href: profileUrl(q),
      actor: q,
      label: "Go to profile",
      resolvable: true,
    }
  }

  // 5. Handle (optionally @-prefixed). parseActor requires a dot and
  //    rejects reserved words, so plain product names ("Simocracy")
  //    return null and fall through to normal search.
  const handle = q.replace(/^@/, "")
  const actor = parseActor(handle)
  if (actor.kind === "handle") {
    return {
      kind: "profile",
      href: profileUrl(actor.value),
      actor: actor.value,
      label: `Go to @${actor.value}`,
      resolvable: true,
    }
  }

  return null
}
