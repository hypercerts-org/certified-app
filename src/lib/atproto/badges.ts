import { authFetch } from "@/lib/auth/fetch"
import type { ListRecordsResponse } from "@/lib/types/api"

/**
 * Certified-badge lexicons. See:
 *   https://github.com/hypercerts-org/hypercerts-lexicon/tree/main/lexicons/app/certified/badge
 *
 * Three records:
 *
 *   - `definition` — defines a badge (title, badgeType, optional
 *     allowedIssuers). Each user that wants to issue endorsements
 *     creates their own definition (lazily, on first endorse).
 *
 *   - `award`      — an issuer awards a badge to a subject (a DID or
 *     a strongRef to any AT-Protocol record). Lives on the issuer's
 *     own PDS.
 *
 *   - `response`   — recipient accepts or rejects an award. Lives on
 *     the recipient's PDS. Not used in phase 1; here for type-only
 *     reference so callers can be added later.
 */
export const BADGE_DEFINITION_COLLECTION = "app.certified.badge.definition"
export const BADGE_AWARD_COLLECTION = "app.certified.badge.award"
export const BADGE_RESPONSE_COLLECTION = "app.certified.badge.response"

/**
 * Canonical badge-type for "endorsement" awards. Filter the user's
 * own definitions by this value to find the one we use to issue
 * endorsements. Distinguishes endorsements from any other badge type
 * a user might define later (mentor, code-reviewer, …).
 */
export const ENDORSEMENT_BADGE_TYPE = "endorsement"

/**
 * Display title used when lazy-creating a user's endorsement
 * definition. UI labels render from this string today; if the user
 * later customises their definition (out of scope for v1), the
 * read paths will pick up whatever the record says.
 */
export const ENDORSEMENT_BADGE_TITLE = "Endorsement"

interface StrongRef {
  uri: string
  cid: string
}

/** Body of an `app.certified.badge.definition` record. */
export interface BadgeDefinitionValue {
  $type?: typeof BADGE_DEFINITION_COLLECTION
  badgeType: string
  title: string
  description?: string
  /**
   * Lexicon currently lists `icon` as required (blob). We intentionally
   * omit it: the UI renders the issuer's live avatar instead of a
   * pinned image, so the field would just be redundant storage that
   * goes stale. A lexicon PR to make `icon` optional is tracked
   * separately; in the meantime some PDSes may be permissive, others
   * may reject — handled at write time with a fallback (see
   * ensureEndorsementDefinition).
   */
  icon?: unknown
  allowedIssuers?: string[]
  createdAt: string
}

/** Body of an `app.certified.badge.award` record. */
export interface BadgeAwardValue {
  $type?: typeof BADGE_AWARD_COLLECTION
  badge: StrongRef
  /**
   * Per lexicon: union of `app.certified.defs#did` (a string) and
   * `com.atproto.repo.strongRef`. For an endorsement we always award
   * to a DID, written as a bare DID string per the `#did` ref.
   */
  subject: string | StrongRef
  note?: string
  createdAt: string
}

/** Body of an `app.certified.badge.response` record. (Phase 2.) */
export interface BadgeResponseValue {
  $type?: typeof BADGE_RESPONSE_COLLECTION
  badgeAward: StrongRef
  response: "accepted" | "rejected"
  weight?: string
  createdAt: string
}

/** Record-with-uri wrappers, as listRecords returns. */
export interface BadgeDefinitionRecord {
  uri: string
  cid: string
  rkey: string
  value: BadgeDefinitionValue
}

export interface BadgeAwardRecord {
  uri: string
  cid: string
  rkey: string
  value: BadgeAwardValue
}

function extractRkey(uri: string): string {
  const idx = uri.lastIndexOf("/")
  return idx >= 0 ? uri.slice(idx + 1) : uri
}

/**
 * List all `badge.definition` records on a user's repo. Used by
 * `ensureEndorsementDefinition` to find an existing endorsement
 * definition before creating a new one, and by read paths that want
 * to resolve an award's `badge` strongRef without a separate
 * getRecord round-trip.
 */
export async function listDefinitions(
  did: string,
  signal?: AbortSignal,
): Promise<BadgeDefinitionRecord[]> {
  const params = new URLSearchParams({
    repo: did,
    collection: BADGE_DEFINITION_COLLECTION,
    limit: "100",
  })
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    signal ? { signal } : undefined,
  )
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return []
    throw new Error(`Failed to list badge definitions: ${res.status}`)
  }
  const data = (await res.json()) as ListRecordsResponse<BadgeDefinitionValue>
  return (data.records ?? []).map((r) => ({
    uri: r.uri,
    cid: r.cid,
    rkey: extractRkey(r.uri),
    value: r.value,
  }))
}

/**
 * Find or create the user's `endorsement` badge definition.
 *
 * - If a definition with `badgeType === "endorsement"` already exists
 *   on the user's repo, return its strong ref unchanged.
 * - Otherwise create a fresh one and return that.
 *
 * Idempotent: concurrent calls within a tab dedupe via the inflight
 * Map below so a double-click on "Endorse" can't write two
 * definitions.
 */
const inflightEnsure = new Map<string, Promise<StrongRef>>()

export async function ensureEndorsementDefinition(
  ownDid: string,
): Promise<StrongRef> {
  const cached = inflightEnsure.get(ownDid)
  if (cached) return cached

  const promise = (async (): Promise<StrongRef> => {
    const existing = await listDefinitions(ownDid)
    const match = existing.find(
      (d) => d.value.badgeType === ENDORSEMENT_BADGE_TYPE,
    )
    if (match) return { uri: match.uri, cid: match.cid }

    // No endorsement definition yet — create one. We omit `icon`
    // intentionally; the UI uses the live issuer avatar. If the PDS
    // rejects (some PDSes enforce the lexicon's required-icon),
    // the caller surfaces the error.
    const body = {
      repo: ownDid,
      collection: BADGE_DEFINITION_COLLECTION,
      record: {
        $type: BADGE_DEFINITION_COLLECTION,
        badgeType: ENDORSEMENT_BADGE_TYPE,
        title: ENDORSEMENT_BADGE_TITLE,
        createdAt: new Date().toISOString(),
      } satisfies BadgeDefinitionValue,
    }
    const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as {
      uri?: string
      cid?: string
      error?: string
    }
    if (!res.ok || !data.uri || !data.cid) {
      throw new Error(
        data.error || `Failed to create endorsement definition: ${res.status}`,
      )
    }
    return { uri: data.uri, cid: data.cid }
  })()

  inflightEnsure.set(ownDid, promise)
  try {
    return await promise
  } finally {
    inflightEnsure.delete(ownDid)
  }
}

/**
 * List badge awards from any user's PDS. Returns the raw records;
 * callers narrow to endorsement awards by resolving each record's
 * `badge` strongRef and filtering on the definition's `badgeType`.
 */
export async function listAwards(
  did: string,
  signal?: AbortSignal,
): Promise<BadgeAwardRecord[]> {
  const params = new URLSearchParams({
    repo: did,
    collection: BADGE_AWARD_COLLECTION,
    limit: "100",
    reverse: "true",
  })
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    signal ? { signal } : undefined,
  )
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return []
    throw new Error(`Failed to list badge awards: ${res.status}`)
  }
  const data = (await res.json()) as ListRecordsResponse<BadgeAwardValue>
  return (data.records ?? []).map((r) => ({
    uri: r.uri,
    cid: r.cid,
    rkey: extractRkey(r.uri),
    value: r.value,
  }))
}

/**
 * Issue an endorsement award. Lazy-creates the issuer's endorsement
 * definition on first use, then writes the award referencing it.
 */
export async function createEndorsementAward(
  ownDid: string,
  subjectDid: string,
  note?: string,
): Promise<{ uri: string; cid: string }> {
  const badge = await ensureEndorsementDefinition(ownDid)

  const body = {
    repo: ownDid,
    collection: BADGE_AWARD_COLLECTION,
    record: {
      $type: BADGE_AWARD_COLLECTION,
      badge,
      subject: subjectDid,
      ...(note?.trim() ? { note: note.trim() } : {}),
      createdAt: new Date().toISOString(),
    } satisfies BadgeAwardValue,
  }
  const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as {
    uri?: string
    cid?: string
    error?: string
  }
  if (!res.ok || !data.uri || !data.cid) {
    throw new Error(
      data.error || `Failed to create endorsement award: ${res.status}`,
    )
  }
  return { uri: data.uri, cid: data.cid }
}

/** Revoke an endorsement (delete the award record). */
export async function deleteEndorsementAward(
  ownDid: string,
  rkey: string,
): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: BADGE_AWARD_COLLECTION,
      rkey,
    }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(
      data.error || `Failed to delete endorsement award: ${res.status}`,
    )
  }
}

/**
 * Convenience predicate: does this award's `subject` resolve to the
 * given DID? Handles both subject shapes (bare DID string and
 * strongRef). For endorsements we always write the bare-string form,
 * but read paths should accept either since other apps may write
 * either.
 */
export function awardSubjectMatchesDid(
  award: BadgeAwardValue,
  did: string,
): boolean {
  const subject = award.subject
  if (typeof subject === "string") return subject === did
  if (subject && typeof subject === "object" && "uri" in subject) {
    // strongRef to a record on a DID's repo — DID is the first
    // segment after `at://`.
    const uri = subject.uri
    if (typeof uri !== "string" || !uri.startsWith("at://")) return false
    const tail = uri.slice("at://".length)
    const slash = tail.indexOf("/")
    const repoDid = slash >= 0 ? tail.slice(0, slash) : tail
    return repoDid === did
  }
  return false
}

/**
 * Extract the issuer DID from an award URI. Used by read paths that
 * fan out across users and need to attribute each award to its
 * author.
 */
export function awardAuthorDid(award: { uri: string }): string | null {
  if (!award.uri.startsWith("at://")) return null
  const tail = award.uri.slice("at://".length)
  const slash = tail.indexOf("/")
  return slash >= 0 ? tail.slice(0, slash) : tail
}
