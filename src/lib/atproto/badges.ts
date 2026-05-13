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

/** A DID wrapped in the `app.certified.defs#did` object form. The
 *  `$type` discriminator is optional on read (some clients write it,
 *  others omit it) but useful on write to keep the union member
 *  explicit. */
interface DidObject {
  $type?: "app.certified.defs#did"
  did: string
}

/** Body of an `app.certified.badge.definition` record. */
export interface BadgeDefinitionValue {
  $type?: typeof BADGE_DEFINITION_COLLECTION
  badgeType: string
  title: string
  description?: string
  /**
   * Optional per the canonical lexicon at
   * hypercerts-org/hypercerts-lexicon. We omit it: the UI renders
   * the issuer's live avatar instead of a pinned image, so the
   * field would just be redundant storage that goes stale.
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
   * Per lexicon: union of `app.certified.defs#did` (object form
   * `{did: "did:plc:..."}`) and `com.atproto.repo.strongRef`.
   *
   * Production data has every record using one of the two object
   * shapes — never a bare DID string. We still accept the bare-string
   * form on read (older records, other clients), but the canonical
   * defs#did form is the object form.
   */
  subject: string | DidObject | StrongRef
  note?: string
  createdAt: string
}

/**
 * Body of an `app.certified.badge.response` record.
 *
 * `response` is typed as `string` (not the union `"accepted" |
 * "rejected"`) because the lexicon declares the values as
 * `knownValues`, which is extensible — another client could write
 * `"muted"`, `"deferred"`, etc. Read paths normalise via
 * `resolveResponseState`; never compare the raw string elsewhere.
 */
export interface BadgeResponseValue {
  $type?: typeof BADGE_RESPONSE_COLLECTION
  badgeAward: StrongRef
  response: string
  weight?: string
  createdAt: string
}

/** Resolved response state used by every UI surface. */
export type ResponseState = "accepted" | "rejected" | "default" | "unknown"

/** A response record from listRecords, with the rkey pre-extracted. */
export interface BadgeResponseRecord {
  uri: string
  cid: string
  rkey: string
  value: BadgeResponseValue
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

    // No endorsement definition yet — create one. `icon` is
    // intentionally omitted (optional in the canonical lexicon; the
    // UI uses the live issuer avatar).
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
      // Canonical `app.certified.defs#did` shape: object with a `did`
      // property. The lexicon defines #did as `{type: "object",
      // required: ["did"]}` — a bare DID string never matched the
      // canonical shape, and the magic-indexer's subject_did
      // generated column (migration 025) only extracts the DID from
      // the object form, so bare-string writes are invisible to the
      // `subject: {eq: did}` filter that powers "endorsements
      // received" on profile pages.
      subject: { $type: "app.certified.defs#did", did: subjectDid },
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

// ---------------------------------------------------------------------------
// app.certified.badge.response — recipient accept/reject lever
// ---------------------------------------------------------------------------

/**
 * List all `badge.response` records on a user's repo. Used by read
 * paths to compute which awards they've accepted vs rejected vs
 * left at default.
 *
 * Returns [] for missing-collection (400/404), so the very first
 * caller for a never-responded user doesn't need to special-case
 * the absence.
 */
export async function listResponses(
  did: string,
  signal?: AbortSignal,
): Promise<BadgeResponseRecord[]> {
  const params = new URLSearchParams({
    repo: did,
    collection: BADGE_RESPONSE_COLLECTION,
    limit: "100",
  })
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    signal ? { signal } : undefined,
  )
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return []
    throw new Error(`Failed to list badge responses: ${res.status}`)
  }
  const data = (await res.json()) as ListRecordsResponse<BadgeResponseValue>
  return (data.records ?? []).map((r) => ({
    uri: r.uri,
    cid: r.cid,
    rkey: extractRkey(r.uri),
    value: r.value,
  }))
}

/**
 * Write a new response record. Lexicon's `key: "tid"` means each
 * call creates a fresh record — we don't overwrite or delete prior
 * responses. `resolveResponseState` reads the latest by createdAt
 * with rkey lexicographic tie-break, so prior records become
 * vestigial but harmless.
 *
 * Why append-only: zero races between tabs/devices, one round-trip
 * per click, vestigial records are tiny.
 */
export async function createResponse(
  ownDid: string,
  badgeAward: StrongRef,
  response: "accepted" | "rejected",
  weight?: string,
): Promise<{ uri: string; cid: string }> {
  const body = {
    repo: ownDid,
    collection: BADGE_RESPONSE_COLLECTION,
    record: {
      $type: BADGE_RESPONSE_COLLECTION,
      badgeAward,
      response,
      ...(weight ? { weight } : {}),
      createdAt: new Date().toISOString(),
    } satisfies BadgeResponseValue,
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
      data.error || `Failed to create badge response: ${res.status}`,
    )
  }
  return { uri: data.uri, cid: data.cid }
}

/**
 * Delete a single response record. Used when the recipient picks
 * "Reset to default" — clears the most-recent response. Earlier
 * vestigial responses still exist and would re-activate the prior
 * state; the caller should pass the rkey of the LATEST response,
 * and ideally call `deleteAllResponsesForAward` to clean up all
 * vestigial siblings.
 */
export async function deleteResponse(
  ownDid: string,
  rkey: string,
): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: BADGE_RESPONSE_COLLECTION,
      rkey,
    }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(
      data.error || `Failed to delete badge response: ${res.status}`,
    )
  }
}

/**
 * Sort responses for an award newest-first, with a deterministic
 * tie-break for collisions (TIDs are time-ordered at PDS-side, so
 * rkey lexicographic descending = creation order descending).
 */
function sortResponsesNewestFirst(
  responses: BadgeResponseRecord[],
): BadgeResponseRecord[] {
  return [...responses].sort((a, b) => {
    if (a.value.createdAt !== b.value.createdAt) {
      return a.value.createdAt > b.value.createdAt ? -1 : 1
    }
    return a.rkey > b.rkey ? -1 : 1
  })
}

/**
 * For a given award URI, find the recipient's latest response.
 *
 * - No response found → `"default"` (un-responded, shows on
 *   profile per the default-show model)
 * - `"accepted"` / `"rejected"` → exactly that
 * - Any other string (the `knownValues` enum is extensible) →
 *   `"unknown"`. UIs treat unknown the same as default — never
 *   silently hide based on a value we don't understand.
 *
 * Joins on the response's `badgeAward.uri` only — the CID is
 * intentionally ignored. If the issuer ever re-creates the award
 * (or rewrites it, hypothetically), the strongRef CID changes but
 * the URI doesn't; we don't want a dangling stricter-than-needed
 * join. Dangling responses (the award was deleted) are harmless —
 * they point at nothing and the caller will never look up by them.
 */
export function resolveResponseState(
  awardUri: string,
  responses: BadgeResponseRecord[],
): { state: ResponseState; latestRkey?: string; rawValue?: string } {
  const matching = responses.filter(
    (r) => r.value.badgeAward?.uri === awardUri,
  )
  if (matching.length === 0) return { state: "default" }
  const latest = sortResponsesNewestFirst(matching)[0]
  const v = latest.value.response
  if (v === "accepted") return { state: "accepted", latestRkey: latest.rkey, rawValue: v }
  if (v === "rejected") return { state: "rejected", latestRkey: latest.rkey, rawValue: v }
  return { state: "unknown", latestRkey: latest.rkey, rawValue: v }
}

/**
 * For "Reset to default" — clean up every response record this
 * recipient ever wrote against the given award URI, so the prior
 * vestigial responses don't re-activate. Returns the count of
 * records deleted.
 *
 * Deletions are serial because the proxy doesn't support batch.
 * For typical "Reset" usage there's 1-3 records to clean, so this
 * is fine.
 */
export async function deleteAllResponsesForAward(
  ownDid: string,
  awardUri: string,
  allResponses: BadgeResponseRecord[],
): Promise<number> {
  const matching = allResponses.filter(
    (r) => r.value.badgeAward?.uri === awardUri,
  )
  for (const r of matching) {
    await deleteResponse(ownDid, r.rkey)
  }
  return matching.length
}
