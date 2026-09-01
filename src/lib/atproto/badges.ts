import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri, rkeyFromUri } from "@/lib/urls"
import { purgeAwardFromLists } from "@/lib/atproto/collection"
import { invalidateEndorsementClosure } from "@/lib/atproto/endorsement-closure-cache"
import { invalidateEndorsementLists } from "@/lib/atproto/endorsement-lists-cache"
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
 * Page through every record in a repo collection via the XRPC proxy,
 * following `cursor` until the PDS returns none.
 *
 * The per-call `limit` is the PDS max (100). A single un-paginated page
 * silently truncates any repo with >100 records — which is exactly what
 * capped the profile "Given" count: a prolific endorser's
 * `badge.award` collection ran past 100 (hypercerts.org had 190), so
 * only the first page reached the endorsement filter (97 shown vs 187
 * actual). `reverse` is forwarded for callers that depend on TID order.
 */
async function listAllRecords<V>(
  did: string,
  collection: string,
  errorLabel: string,
  signal?: AbortSignal,
  opts?: { noCache?: boolean; reverse?: boolean },
): Promise<{ uri: string; cid: string; value: V }[]> {
  const out: { uri: string; cid: string; value: V }[] = []
  let cursor: string | undefined
  // Defensive page ceiling: 100 pages * 100 = 10k records, far past any
  // real badge repo, so a PDS that never drops its cursor can't loop us
  // forever.
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ repo: did, collection, limit: "100" })
    if (opts?.reverse) params.set("reverse", "true")
    if (cursor) params.set("cursor", cursor)
    // Post-write refetches pass `noCache` to bypass the proxy's 5s
    // same-session listRecords cache — otherwise the browser hands back
    // the pre-write response and the UI's state is stuck.
    const init: RequestInit = {}
    if (signal) init.signal = signal
    if (opts?.noCache) init.cache = "no-store"
    const res = await authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
      init,
    )
    if (!res.ok) {
      // 400/404 on the first page = empty/absent collection → []. On a
      // later page it's an unexpected mid-pagination failure; stop and
      // keep the partial set rather than discarding records already read.
      if (res.status === 400 || res.status === 404) break
      throw new Error(`${errorLabel}: ${res.status}`)
    }
    const data = (await res.json()) as ListRecordsResponse<V>
    for (const r of data.records ?? []) {
      out.push({ uri: r.uri, cid: r.cid, value: r.value })
    }
    if (!data.cursor) break
    cursor = data.cursor
  }
  return out
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
  const records = await listAllRecords<BadgeDefinitionValue>(
    did,
    BADGE_DEFINITION_COLLECTION,
    "Failed to list badge definitions",
    signal,
    opts,
  )
  return records.map((r) => ({
    uri: r.uri,
    cid: r.cid,
    rkey: rkeyFromUri(r.uri),
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
 *     more than one `badgeType === "endorsement"` record, pick the
 *     OLDEST by `createdAt` as the canonical. Selection stays stable
 *     across reads (oldest never reshuffles), so concurrent reads
 *     converge. Cleanup then best-effort deletes only the records
 *     that are EXACTLY redundant — same content as an older sibling
 *     AND referenced by no award. A definition with distinct content
 *     (a hand-authored "Organization Endorsement", say) is never
 *     touched, however many endorsement-typed defs sit beside it.
 *     The deletes use a `suppressUnauthorizedHandler` authFetch so a
 *     transient 401 during cleanup doesn't log the user out as a
 *     side-effect of a successful endorse.
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
    backgroundPruneDuplicates(ownDid, matched.duplicates)
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
        backgroundPruneDuplicates(ownDid, recheckMatch.duplicates)
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
 * `duplicates` holds ONLY exact-content redundancies — see
 * `definitionContentKey`. Matching on `badgeType` alone (as this once
 * did) treated every distinct endorsement badge as disposable and
 * deleted hand-authored definitions; the read path at
 * `endorsementDefUriSet` documents why those legitimately exist.
 *
 * Note the canonical is the oldest endorsement-typed def regardless of
 * content, so a custom def older than the app's default one becomes
 * the ref for new awards. Pre-existing behaviour, left as-is.
 */
export function resolveCanonicalEndorsementDef(
  defs: BadgeDefinitionRecord[],
): { canonical: BadgeDefinitionRecord; duplicates: BadgeDefinitionRecord[] } | null {
  const matches = defs
    .filter((d) => d.value.badgeType === ENDORSEMENT_BADGE_TYPE)
    .slice()
    .sort(byCreatedAtAscending)
  if (matches.length === 0) return null
  const [canonical] = matches

  // A duplicate is a definition whose content is EXACTLY that of an
  // older sibling — same title, description, icon and allowedIssuers.
  // Grouping by content key means a definition carrying unique content
  // is never a duplicate, however many other endorsement-typed
  // definitions sit beside it in the repo. `matches` is already sorted
  // oldest-first, so the first occurrence of each key is the survivor.
  const seen = new Set<string>()
  const duplicates: BadgeDefinitionRecord[] = []
  for (const def of matches) {
    const key = definitionContentKey(def.value)
    if (seen.has(key)) duplicates.push(def)
    else seen.add(key)
  }
  return { canonical, duplicates }
}

/**
 * Sort ascending by createdAt so the OLDEST def is canonical.
 * A def missing createdAt sorts to the END (treated as latest) so a
 * malformed def can never win canonical.
 */
function byCreatedAtAscending(
  a: BadgeDefinitionRecord,
  b: BadgeDefinitionRecord,
): number {
  const aHas = typeof a.value.createdAt === "string" && a.value.createdAt !== ""
  const bHas = typeof b.value.createdAt === "string" && b.value.createdAt !== ""
  if (!aHas && !bHas) return 0
  if (!aHas) return 1
  if (!bHas) return -1
  if (a.value.createdAt === b.value.createdAt) return 0
  return a.value.createdAt < b.value.createdAt ? -1 : 1
}

/**
 * Content fingerprint of a badge definition: every field that carries
 * meaning, and nothing that doesn't. Record identity (`uri` / `cid` /
 * `rkey`) and `createdAt` are excluded precisely because genuine twins
 * differ in exactly those.
 */
export function definitionContentKey(value: BadgeDefinitionValue): string {
  return stableStringify({
    badgeType: value.badgeType,
    title: value.title,
    description: value.description ?? null,
    icon: value.icon ?? null,
    // Typed `string[] | undefined`, but it arrives via `listDefinitions`,
    // which casts the listRecords response with no runtime validation —
    // a foreign client can put any shape in this field. Spreading it
    // unguarded threw on a non-iterable and failed the whole endorse.
    // Absent / null still normalises to `[]` so genuine twins keep
    // matching; anything else passes through as itself, so a malformed
    // def stays DISTINCT from a well-formed one rather than becoming
    // its deletion-eligible twin.
    allowedIssuers: Array.isArray(value.allowedIssuers)
      ? [...value.allowedIssuers].sort()
      : (value.allowedIssuers ?? []),
  })
}

/**
 * JSON with object keys sorted recursively, so two structurally-equal
 * values always serialise identically. Needed because `icon` is an
 * opaque blob ref whose key order isn't guaranteed across reads.
 *
 * The bias here is deliberate: if this ever fails to normalise
 * something, two identical defs simply look different, and the result
 * is a MISSED cleanup — never an erroneous delete.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")}}`
}

/**
 * Delete exact-content duplicate definitions, but only those no award
 * still points at. Identical content does NOT imply identical URI, so
 * a redundant copy can still be the `badge` ref of existing awards —
 * deleting it would leave them dangling and drop them out of the
 * Given/Received views.
 *
 * A narrowing, not a proof. An award read that THROWS skips the prune,
 * but an empty result is not evidence of absence: the XRPC proxy fails
 * OPEN for listRecords — an unresolvable DID or an upstream 400/404
 * both come back as an empty list rather than an error (see
 * `proxyPublicListRecords`, and `listAllRecords`' own first-page
 * 400/404 break above) — so an unreadable collection is
 * indistinguishable from an empty one. Only the acting user's own
 * awards are visible here either; a foreign award referencing this
 * repo's definition can't be checked cheaply. Both are why the
 * content-equality rule above must stay strict: it, not this gate, is
 * what keeps a distinct definition out of `duplicates` at all.
 */
function backgroundPruneDuplicates(
  ownDid: string,
  duplicates: BadgeDefinitionRecord[],
): void {
  if (duplicates.length === 0) return
  void (async () => {
    try {
      const awards = await listAwards(ownDid)
      const referenced = new Set(
        awards
          .map((a) => a.value.badge?.uri)
          .filter((uri): uri is string => typeof uri === "string"),
      )
      const unreferenced = duplicates.filter((d) => !referenced.has(d.uri))
      if (unreferenced.length > 0) backgroundDeleteDuplicates(unreferenced)
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[badges] duplicate prune skipped — award read failed",
          err,
        )
      }
    }
  })()
}

/**
 * Fire-and-forget delete of duplicate badge definitions. Errors are
 * suppressed (cleanup is best-effort) but logged in dev so a
 * persistent problem is debuggable. Uses
 * `suppressUnauthorizedHandler` so a transient 401 here doesn't
 * trigger the auth-context auto-logout — a sign-in race shouldn't
 * sign the user out the moment they succeed.
 *
 * Every URI handed here must already have been screened by
 * `backgroundPruneDuplicates`; this function checks nothing itself.
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
 * Find or create a GROUP's `endorsement` badge definition.
 *
 * The group-acting analogue of `ensureEndorsementDefinition`: when the
 * viewer acts as a group, the award must reference a definition owned
 * by the GROUP's repo, not the operator's. Reads the group's existing
 * definitions through the same federated `listDefinitions` path (the
 * XRPC proxy reads any repo by DID), resolves the canonical
 * endorsement def, and returns its strong ref unchanged if found.
 * Otherwise creates one via the group BFF route
 * `/api/groups/<groupDid>/endorsement-definition`, which proxies the
 * createRecord through the operator's OAuth session to the group's
 * service auth.
 *
 * Mirrors the personal path's concurrency guards — same-tab inflight
 * map, cross-tab Web Lock, and a `noCache` re-read inside the critical
 * section. The foreign-repo read is cached for 30s, so without the
 * re-read a bulk group endorse minted one definition per person.
 *
 * Duplicates are never deleted here: this path can only write through
 * the group BFF, and the personal deleteRecord proxy is hard-gated to
 * `repo === sessionDid`. Extra group defs are inert — oldest wins on
 * every subsequent read.
 */
export async function ensureGroupEndorsementDefinition(
  groupDid: string,
): Promise<StrongRef> {
  const cached = inflightGroupEnsure.get(groupDid)
  if (cached) return cached

  const promise = ensureGroupEndorsementDefinitionInner(groupDid)
  inflightGroupEnsure.set(groupDid, promise)
  try {
    return await promise
  } finally {
    inflightGroupEnsure.delete(groupDid)
  }
}

const inflightGroupEnsure = new Map<string, Promise<StrongRef>>()

async function ensureGroupEndorsementDefinitionInner(
  groupDid: string,
): Promise<StrongRef> {
  const existing = await listDefinitions(groupDid)
  const matched = resolveCanonicalEndorsementDef(existing)
  if (matched) {
    return { uri: matched.canonical.uri, cid: matched.canonical.cid }
  }
  const lockName = `endorse-def:${groupDid}`
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(lockName, () =>
      createGroupDefinitionIfStillMissing(groupDid),
    )
  }
  return createGroupDefinitionIfStillMissing(groupDid)
}

/**
 * Re-read with `noCache` before minting. The group's definitions are a
 * FOREIGN repo read, served with `Cache-Control: private, max-age=30`
 * (see the xrpc proxy's `proxyPublicListRecords`) — six times the
 * same-session window. Without busting it, the second endorsement in a
 * bulk pass reads a pre-create snapshot, finds nothing, and mints a
 * second definition; N sequential group endorsements minted N defs.
 */
async function createGroupDefinitionIfStillMissing(
  groupDid: string,
): Promise<StrongRef> {
  const recheck = await listDefinitions(groupDid, undefined, {
    noCache: true,
  })
  const recheckMatch = resolveCanonicalEndorsementDef(recheck)
  if (recheckMatch) {
    return { uri: recheckMatch.canonical.uri, cid: recheckMatch.canonical.cid }
  }
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/endorsement-definition`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    uri?: string
    cid?: string
    error?: string
  }
  if (!res.ok || !data.uri || !data.cid) {
    throw new Error(
      data.error ||
        `Failed to create group endorsement definition: ${res.status}`,
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
  // Page through ALL awards — reading only the first 100-record page
  // truncated the profile "Given" count (97 endorsements shown for a
  // repo holding 187). `reverse: true` preserves the ascending-TID order
  // earlier callers saw; the Given hook re-sorts by createdAt regardless.
  const records = await listAllRecords<BadgeAwardValue>(
    did,
    BADGE_AWARD_COLLECTION,
    "Failed to list badge awards",
    signal,
    { noCache: opts?.noCache, reverse: true },
  )
  return records.map((r) => ({
    uri: r.uri,
    cid: r.cid,
    rkey: rkeyFromUri(r.uri),
    value: r.value,
  }))
}

/**
 * Resolve the `badgeType` of a badge definition addressed by its
 * at-uri, fetching the record from WHICHEVER repo owns it (the proxy
 * resolves the foreign PDS server-side). Definitions are effectively
 * immutable, so successful lookups are memoised per-process. Returns
 * null on any miss (malformed uri, wrong collection, unreachable).
 */
const defBadgeTypeCache = new Map<string, string | null>()
export async function getDefinitionBadgeType(
  uri: string,
  signal?: AbortSignal,
  opts?: { noCache?: boolean },
): Promise<string | null> {
  if (!opts?.noCache && defBadgeTypeCache.has(uri)) {
    return defBadgeTypeCache.get(uri) ?? null
  }
  const parsed = parseAtUri(uri)
  if (!parsed || parsed.collection !== BADGE_DEFINITION_COLLECTION) return null
  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  })
  const init: RequestInit = {}
  if (signal) init.signal = signal
  if (opts?.noCache) init.cache = "no-store"
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
    init,
  )
  if (!res.ok) return null
  const data = (await res.json()) as { value?: BadgeDefinitionValue }
  const badgeType = data.value?.badgeType ?? null
  if (!signal?.aborted) defBadgeTypeCache.set(uri, badgeType)
  return badgeType
}

/**
 * Build the set of endorsement-typed definition URIs referenced by a
 * batch of awards.
 *
 * Endorsement awards reference a badge `definition` that need NOT live
 * in the issuer's own repo: a "Trusted Evaluator" endorses on behalf of
 * their organisation using a centrally-defined badge owned by another
 * account (e.g. Ma Earth's "Organization Endorsement"). The earlier
 * filter only matched the issuer's OWN definitions, so awards made with
 * a cross-repo definition silently vanished from the Given view.
 *
 * We classify cheaply where we can — definitions the issuer owns are
 * already in hand via `listDefinitions` — and only `getRecord` the
 * referenced definitions that aren't (typically a single shared one,
 * then memoised).
 */
export async function endorsementDefUriSet(
  awards: BadgeAwardRecord[],
  ownDefs: BadgeDefinitionRecord[],
  signal?: AbortSignal,
  opts?: { noCache?: boolean },
): Promise<Set<string>> {
  const endorsementDefUris = new Set<string>()
  for (const d of ownDefs) {
    if (d.value.badgeType === ENDORSEMENT_BADGE_TYPE) endorsementDefUris.add(d.uri)
  }
  // Referenced definition URIs not already classified from the own-repo
  // defs — resolve them cross-repo and keep the endorsement-typed ones.
  const referenced = new Set<string>()
  for (const a of awards) {
    const uri = a.value.badge?.uri
    if (uri && !endorsementDefUris.has(uri)) referenced.add(uri)
  }
  await Promise.all(
    Array.from(referenced).map(async (uri) => {
      const badgeType = await getDefinitionBadgeType(uri, signal, opts).catch(
        () => null,
      )
      if (badgeType === ENDORSEMENT_BADGE_TYPE) endorsementDefUris.add(uri)
    }),
  )
  return endorsementDefUris
}

/**
 * Read the set of DIDs `did` has endorsed (degree-1 outbound edges on
 * the certified endorsement graph). Authoritative from the viewer's
 * own PDS — no indexer call. Used as a fallback for the /explore
 * "Endorsed accounts" filter while magic-indexer #117 (the server-
 * side closure endpoint) is still open, and as the source of truth
 * for degree 1 once it lands.
 */
export async function fetchGivenEndorsementDids(
  did: string,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const [defs, awards] = await Promise.all([
    listDefinitions(did, signal),
    listAwards(did, signal),
  ])
  // Endorsement-typed definition URIs — own-repo defs plus any
  // cross-repo (centrally-defined) definitions the awards reference.
  const endorsementDefUris = await endorsementDefUriSet(awards, defs, signal)
  const out = new Set<string>()
  for (const award of awards) {
    if (!endorsementDefUris.has(award.value.badge?.uri ?? "")) continue
    const subject = extractAwardSubjectDid(award.value.subject)
    if (subject && subject !== did) out.add(subject)
  }
  return out
}

/** Max byte length we'll allow on `note` from the client. Mirrors
 *  what the UI's character counter caps at, so writes never get
 *  rejected at the PDS for going over. */
const BADGE_AWARD_NOTE_MAX = 500

/**
 * Write a badge award on `ownDid`'s repo against the supplied badge
 * strongRef. Lower-level helper consumed by `createEndorsementAward`,
 * which wraps it with the lazy ensure-default-def step.
 */
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
 *
 * Routing:
 *   - Default: writes against the issuer's DEFAULT endorsement def on
 *     `ownDid`'s personal PDS via the XRPC proxy (unchanged).
 *   - With `opts.targetDid` (acting-as-group): the award is issued BY
 *     the group. Ensures the GROUP's endorsement def, then writes the
 *     award through the group BFF route `/api/groups/<targetDid>/endorse`,
 *     which proxies via the operator's OAuth session to the group's
 *     service auth. Mirrors `createFollow`'s group path.
 */
export async function createEndorsementAward(
  ownDid: string,
  subjectDid: string,
  note?: string,
  opts?: { targetDid?: string },
): Promise<{ uri: string; cid: string }> {
  const targetDid = opts?.targetDid
  if (targetDid && targetDid !== ownDid) {
    const badge = await ensureGroupEndorsementDefinition(targetDid)
    const res = await authFetch(
      `/api/groups/${encodeURIComponent(targetDid)}/endorse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subjectDid, badge, note }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      uri?: string
      cid?: string
      error?: string
    }
    if (!res.ok || !data.uri || !data.cid) {
      throw new Error(
        data.error ||
          `Failed to create group endorsement award: ${res.status}`,
      )
    }
    // Bust the endorsement-closure cache — same rationale as the
    // personal path below.
    invalidateEndorsementClosure()
    return { uri: data.uri, cid: data.cid }
  }
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
 *
 * Routing:
 *   - Default: deletes the award on `ownDid`'s personal PDS via the
 *     XRPC proxy (unchanged).
 *   - With `opts.targetDid` (acting-as-group): the award lives on the
 *     GROUP's repo, so the delete goes through the group BFF route
 *     `/api/groups/<targetDid>/endorse`. Endorsement lists are
 *     personal, so the group path skips `purgeAwardFromLists` (the
 *     group has no lists referencing this award) but still busts both
 *     caches for parity with the personal path.
 */
export async function deleteEndorsementAward(
  ownDid: string,
  rkey: string,
  opts?: { targetDid?: string },
): Promise<void> {
  const targetDid = opts?.targetDid
  if (targetDid && targetDid !== ownDid) {
    const res = await authFetch(
      `/api/groups/${encodeURIComponent(targetDid)}/endorse`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rkey }),
      },
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(
        data.error ||
          `Failed to delete group endorsement award: ${res.status}`,
      )
    }
    invalidateEndorsementClosure()
    invalidateEndorsementLists()
    return
  }
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
  // `purgeAwardFromLists` above may have rewritten one or more of
  // the issuer's lists. Notify any mounted `useEndorsementLists`
  // so a sibling list-detail view reflects the removal without
  // waiting for the next mount or the 5-min cache TTL.
  invalidateEndorsementLists()
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
    rkey: rkeyFromUri(r.uri),
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
  opts?: { targetDid?: string; weight?: string },
): Promise<{ uri: string; cid: string }> {
  const weight = opts?.weight
  // Acting as a group (recipient): route the response to the GROUP's repo
  // via the BFF so the group's own profile reflects the accept/reject.
  // Personal path (no targetDid) is unchanged below.
  if (opts?.targetDid && opts.targetDid !== ownDid) {
    const res = await authFetch(
      `/api/groups/${encodeURIComponent(opts.targetDid)}/response`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ award: badgeAward, response, weight }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      uri?: string
      cid?: string
      error?: string
    }
    if (!res.ok || !data.uri || !data.cid) {
      throw new Error(
        data.error || `Failed to create group badge response: ${res.status}`,
      )
    }
    invalidateEndorsementClosure()
    return { uri: data.uri, cid: data.cid }
  }

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
  opts?: { targetDid?: string },
): Promise<void> {
  // Acting as a group: delete the response from the GROUP's repo via the BFF.
  if (opts?.targetDid && opts.targetDid !== ownDid) {
    const res = await authFetch(
      `/api/groups/${encodeURIComponent(opts.targetDid)}/response`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rkey }),
      },
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(
        data.error || `Failed to delete group badge response: ${res.status}`,
      )
    }
    return
  }
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
  opts?: { targetDid?: string },
): Promise<number> {
  const matching = allResponses.filter(
    (r) => r.value.badgeAward?.uri === awardUri,
  )
  for (const r of matching) {
    await deleteResponse(ownDid, r.rkey, opts)
  }
  return matching.length
}
