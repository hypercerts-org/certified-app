import { authFetch } from "@/lib/auth/fetch"
import { purgeAwardFromLists } from "@/lib/atproto/collection"
import { invalidateEndorsementClosure } from "@/lib/atproto/endorsement-closure-cache"
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
 * Pull the subject DID out of an award's `subject` field, which the
 * lexicon types as a union of three shapes:
 *
 *   - `string`                          — bare DID (legacy / loose clients).
 *   - `{$type, did: "..."}`             — canonical `app.certified.defs#did`.
 *   - `{$type, uri: "at://did/..."}`    — strongRef whose URI begins with
 *                                         the subject DID.
 *
 * Returns the bare DID for all three, or `null` when the field is
 * missing / unrecognised.
 */
export function extractAwardSubjectDid(
  subject: BadgeAwardValue["subject"] | undefined,
): string | null {
  if (!subject) return null
  if (typeof subject === "string") {
    return subject.startsWith("did:") ? subject : null
  }
  if (typeof subject !== "object") return null
  const obj = subject as unknown as Record<string, unknown>
  if (typeof obj.did === "string" && obj.did.startsWith("did:")) {
    return obj.did
  }
  if (typeof obj.uri === "string" && obj.uri.startsWith("at://did:")) {
    // strongRef URI: at://<did>/<collection>/<rkey>. Slice between
    // the scheme and the next slash.
    const tail = obj.uri.slice("at://".length)
    const slash = tail.indexOf("/")
    return slash >= 0 ? tail.slice(0, slash) : tail
  }
  return null
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
  opts?: { noCache?: boolean },
): Promise<BadgeDefinitionRecord[]> {
  const params = new URLSearchParams({
    repo: did,
    collection: BADGE_DEFINITION_COLLECTION,
    limit: "100",
  })
  // Post-write refetches need to bypass the proxy's 5s same-session
  // cache (`Cache-Control: private, max-age=5`) — otherwise the
  // browser hands back the pre-delete response and the UI's button
  // state is stuck.
  const init: RequestInit = {}
  if (signal) init.signal = signal
  if (opts?.noCache) init.cache = "no-store"
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    init,
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

/**
 * Find or create the user's `endorsement` badge definition.
 *
 * Two-layer cross-tab safety:
 *
 *   - **Layer 1 — dedupe-on-read.** If `listDefinitions` returns
 *     more than one `badgeType === "endorsement"` record (because a
 *     previous race created duplicates), pick the OLDEST by
 *     `createdAt` as the canonical, and best-effort delete the
 *     newer duplicates in the background. The deletes use a
 *     `suppressUnauthorizedHandler` authFetch so a transient 401
 *     during cleanup doesn't log the user out as a side-effect of
 *     a successful endorse. Selection stays stable across reads
 *     (oldest never reshuffles), so concurrent reads converge.
 *
 *   - **Layer 2 — `navigator.locks`.** The create critical section
 *     is wrapped in a Web Lock keyed by `endorse-def:${ownDid}` so
 *     two tabs racing on the same account serialise; the loser
 *     re-lists (with `noCache: true` to bypass the proxy's 5s
 *     same-session cache) and returns the winner's def instead of
 *     creating a second.
 *
 * The same-tab `inflightEnsure` Map still earns its keep: it dedupes
 * React strict-mode double-invokes within a single tab, which Web
 * Locks does NOT cover (one tab calling the lock twice still enters
 * once but both call sites see the lock open before the first
 * acquires).
 *
 * Existing duplicates from past races self-heal on the next read —
 * no batch migration needed.
 */
export async function ensureEndorsementDefinition(
  ownDid: string,
): Promise<StrongRef> {
  const cached = inflightEnsure.get(ownDid)
  if (cached) return cached

  const promise = ensureEndorsementDefinitionInner(ownDid)
  inflightEnsure.set(ownDid, promise)
  try {
    return await promise
  } finally {
    inflightEnsure.delete(ownDid)
  }
}

async function ensureEndorsementDefinitionInner(
  ownDid: string,
): Promise<StrongRef> {
  // Initial read — outside the lock so the common case (definition
  // already exists, no race) skips the lock overhead entirely.
  const existing = await listDefinitions(ownDid)
  const matched = resolveCanonicalEndorsementDef(existing)
  if (matched) {
    if (matched.duplicates.length > 0) {
      backgroundDeleteDuplicates(matched.duplicates)
    }
    return { uri: matched.canonical.uri, cid: matched.canonical.cid }
  }

  // No definition found — enter the create critical section. Web
  // Locks serialises across tabs in the same browser; absent the
  // API (very old browsers / non-browser env), fall through to the
  // unlocked create path (today's behaviour). Lock name includes
  // ownDid so two accounts in one browser don't serialise on each
  // other.
  const lockName = `endorse-def:${ownDid}`
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(lockName, async () => {
      // Re-list inside the lock with noCache so the just-written
      // record from the lock-winner is visible to the loser. Without
      // noCache, the 5s `Cache-Control: private, max-age=5` on the
      // XRPC proxy's listRecords would hand back a stale response
      // and the loser would create a second definition.
      const recheck = await listDefinitions(ownDid, undefined, {
        noCache: true,
      })
      const recheckMatch = resolveCanonicalEndorsementDef(recheck)
      if (recheckMatch) {
        if (recheckMatch.duplicates.length > 0) {
          backgroundDeleteDuplicates(recheckMatch.duplicates)
        }
        return {
          uri: recheckMatch.canonical.uri,
          cid: recheckMatch.canonical.cid,
        }
      }
      return createEndorsementDefinition(ownDid)
    })
  }
  return createEndorsementDefinition(ownDid)
}

/**
 * Pick the canonical endorsement definition out of a list of badge
 * definitions, plus the duplicates that should be cleaned up.
 *
 * Canonical = OLDEST by `createdAt`. Stable: a definition with an
 * earlier `createdAt` never loses to a later one regardless of
 * which tab does the read, so concurrent readers converge.
 *
 * Stale-config concern: the default endorsement def is minimal
 * (`title` + `badgeType` + `createdAt`) and never mutated
 * post-create. If list-style customisation ever lands on it the
 * invariant flips and the canonical choice must be revisited.
 */
function resolveCanonicalEndorsementDef(
  defs: BadgeDefinitionRecord[],
): { canonical: BadgeDefinitionRecord; duplicates: BadgeDefinitionRecord[] } | null {
  const matches = defs
    .filter((d) => d.value.badgeType === ENDORSEMENT_BADGE_TYPE)
    .slice()
    .sort((a, b) =>
      (a.value.createdAt ?? "") < (b.value.createdAt ?? "") ? -1 : 1,
    )
  if (matches.length === 0) return null
  const [canonical, ...duplicates] = matches
  return { canonical, duplicates }
}

/**
 * Fire-and-forget delete of duplicate badge definitions. Errors are
 * suppressed (cleanup is best-effort) but logged in dev so a
 * persistent problem is debuggable. Uses
 * `suppressUnauthorizedHandler` so a transient 401 here doesn't
 * trigger the auth-context auto-logout — a sign-in race shouldn't
 * sign the user out the moment they succeed.
 */
function backgroundDeleteDuplicates(
  duplicates: BadgeDefinitionRecord[],
): void {
  for (const dup of duplicates) {
    const repo = extractDidFromUri(dup.uri)
    if (!repo) continue
    const body = JSON.stringify({
      repo,
      collection: BADGE_DEFINITION_COLLECTION,
      rkey: dup.rkey,
    })
    void authFetch(
      "/api/xrpc/com/atproto/repo/deleteRecord",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      },
      { suppressUnauthorizedHandler: true },
    ).catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[badges] background dedupe-delete failed",
          dup.uri,
          err,
        )
      }
    })
  }
}

/**
 * Helper to pull the repo DID out of a `at://did:.../<collection>/<rkey>`
 * URI for the deleteRecord call. Defined here so it stays alongside
 * the read/write paths. */
function extractDidFromUri(uri: string): string | null {
  if (!uri.startsWith("at://")) return null
  const tail = uri.slice("at://".length)
  const slash = tail.indexOf("/")
  return slash >= 0 ? tail.slice(0, slash) : tail
}

async function createEndorsementDefinition(ownDid: string): Promise<StrongRef> {
  // `icon` is intentionally omitted (optional in the canonical
  // lexicon; the UI uses the live issuer avatar).
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
}

/**
 * List badge awards from any user's PDS. Returns the raw records;
 * callers narrow to endorsement awards by resolving each record's
 * `badge` strongRef and filtering on the definition's `badgeType`.
 */
export async function listAwards(
  did: string,
  signal?: AbortSignal,
  opts?: { noCache?: boolean },
): Promise<BadgeAwardRecord[]> {
  const params = new URLSearchParams({
    repo: did,
    collection: BADGE_AWARD_COLLECTION,
    limit: "100",
    reverse: "true",
  })
  // See listDefinitions: refetches right after a write need to skip
  // the proxy's 5s same-session listRecords cache.
  const init: RequestInit = {}
  if (signal) init.signal = signal
  if (opts?.noCache) init.cache = "no-store"
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    init,
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
 * Write a badge award on `ownDid`'s repo against the supplied badge
 * strongRef. Lower-level helper consumed by `createEndorsementAward`,
 * which wraps it with the lazy ensure-default-def step.
 */
/** Max byte length we'll allow on `note` from the client. Mirrors
 *  what the UI's character counter caps at, so writes never get
 *  rejected at the PDS for going over. */
const BADGE_AWARD_NOTE_MAX = 500

async function writeBadgeAward(
  ownDid: string,
  subjectDid: string,
  badge: StrongRef,
  errorLabel = "badge award",
  note?: string,
): Promise<{ uri: string; cid: string }> {
  const record: BadgeAwardValue = {
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
    createdAt: new Date().toISOString(),
  }
  // Trim + truncate the note. Empty strings are omitted entirely so
  // we don't store noise that round-trips on every read.
  const trimmedNote = note?.trim()
  if (trimmedNote) {
    record.note = trimmedNote.slice(0, BADGE_AWARD_NOTE_MAX)
  }
  const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: BADGE_AWARD_COLLECTION,
      record,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    uri?: string
    cid?: string
    error?: string
  }
  if (!res.ok || !data.uri || !data.cid) {
    throw new Error(
      data.error || `Failed to create ${errorLabel}: ${res.status}`,
    )
  }
  return { uri: data.uri, cid: data.cid }
}

/**
 * Issue an endorsement award against the issuer's DEFAULT endorsement
 * definition (the auto-created one with title "Endorsement"). Lazy-
 * creates the definition on first use, then writes the award.
 *
 * Optional `note` is the issuer's free-form reason for the endorsement
 * (UI surfaces ask "Briefly explain why your endorsement?" and the
 * answer lands in `app.certified.badge.award.note`). Empty / blank
 * notes are dropped before the write so the field is omitted entirely
 * for endorsements without a reason.
 */
export async function createEndorsementAward(
  ownDid: string,
  subjectDid: string,
  note?: string,
): Promise<{ uri: string; cid: string }> {
  const badge = await ensureEndorsementDefinition(ownDid)
  const result = await writeBadgeAward(ownDid, subjectDid, badge, "endorsement award", note)
  // Bust the endorsement-closure cache (certified-app #84). Cheap
  // counter bump + listener notify; the explore hook re-fetches
  // because its effect deps include the cache version. Safe to fire
  // even if no /explore tab is open — no subscribers, no work.
  invalidateEndorsementClosure()
  return result
}

/**
 * Revoke an endorsement (delete the award record). Also purges the
 * award from every endorsement-list owned by `ownDid` so a Given-
 * panel revoke doesn't leave ghost rows on the Lists tab. The purge
 * is best-effort (errors logged in dev, swallowed in prod) — the
 * read path drops unresolved list items silently, so a partial
 * failure delays cleanup but doesn't corrupt anything.
 */
export async function deleteEndorsementAward(
  ownDid: string,
  rkey: string,
): Promise<void> {
  const awardUri = `at://${ownDid}/${BADGE_AWARD_COLLECTION}/${rkey}`
  await purgeAwardFromLists(ownDid, awardUri)
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
  // Bust the endorsement-closure cache — same rationale as
  // createEndorsementAward above.
  invalidateEndorsementClosure()
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
  opts?: { noCache?: boolean },
): Promise<BadgeResponseRecord[]> {
  const params = new URLSearchParams({
    repo: did,
    collection: BADGE_RESPONSE_COLLECTION,
    limit: "100",
  })
  // After a response write, callers MUST pass `noCache: true` so
  // the next read doesn't get the pre-write snapshot from the XRPC
  // proxy's 5s `Cache-Control: private, max-age=5`. Without it the
  // user has to click twice — the first write lands, but the refetch
  // returns the stale list and the rendered state doesn't update.
  // Same pattern as listDefinitions.
  const init: RequestInit = {}
  if (signal) init.signal = signal
  if (opts?.noCache) init.cache = "no-store"
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    init,
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
  // Bust the endorsement-closure cache (certified-app #84). A
  // rejection response REMOVES the edge from the indexer's
  // materialised view on next refresh; an acceptance response is
  // ignored by the view but bumping anyway is cheap (counter +
  // notify-listeners) and avoids the conditional. The explore hook
  // re-fetches because its effect deps include the cache version.
  invalidateEndorsementClosure()
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
  // Bust the endorsement-closure cache (certified-app #84). Deleting
  // a rejection response causes the edge to *reappear* on the next
  // indexer refresh — the explore view should refetch.
  invalidateEndorsementClosure()
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
