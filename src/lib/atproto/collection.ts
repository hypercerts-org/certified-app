import { authFetch } from "@/lib/auth/fetch"

const COLLECTION = "org.hypercerts.collection"

/**
 * `type` discriminator used by endorsement-list collection records.
 * Matches the `list:certs` / `list:projects` / `list:accounts`
 * convention used by typed-lists — every "X is a curated list of Y"
 * collection records its kind as `list:<plural>`. Sibling
 * discriminator to the project flow's `"project"` value, which
 * the Projects tab filters on. The two filters are symmetric —
 * lists are excluded from the Projects tab and projects are
 * excluded from the Lists tab.
 *
 * Records created before this rename used `"endorsement-list"`;
 * read paths now filter strictly to `"list:endorsements"`, so any
 * existing records need to be migrated to the new value before
 * they reappear in the Lists view.
 */
export const ENDORSEMENT_LIST_TYPE = "list:endorsements"

/**
 * Loose shape of an `org.hypercerts.collection` record. The lexicon
 * lives outside this repo so the fields below are best-effort — the
 * components consuming the records narrow as needed and treat anything
 * else as optional / unknown. The `type` discriminator is what the
 * Projects tab filters on (`type === "project"`) and what the Lists
 * tab filters on (`type === "list:endorsements"`).
 */
export interface CollectionValue {
  $type?: string
  type?: string
  title?: string
  name?: string
  description?: string
  shortDescription?: string
  createdAt?: string
  [key: string]: unknown
}

/**
 * Strong-ref shape used inside `items[i].itemIdentifier`. Matches the
 * project flow (see `app/api/groups/[groupDid]/project/route.ts`):
 * an at:// URI plus the referenced record's CID.
 */
export interface ItemIdentifier {
  uri: string
  cid: string
}

/**
 * One entry in an endorsement-list collection's `items` array. The
 * lexicon allows extra fields per item (preserved on round-trip);
 * `itemIdentifier` is the only required shape. For lists, it strong-
 * refs an `app.certified.badge.award` record on the same issuer's PDS.
 */
export interface CollectionItem {
  itemIdentifier: ItemIdentifier
  addedAt?: string
  [key: string]: unknown
}

/**
 * Narrowed view of an endorsement-list collection record. Used by the
 * lists hook + components; reads remain loose at the boundary
 * (`CollectionValue`) and narrow internally once `type === "list:endorsements"`
 * is confirmed.
 */
export interface EndorsementListCollectionValue extends CollectionValue {
  type: typeof ENDORSEMENT_LIST_TYPE
  title: string
  description?: string
  createdAt: string
  items?: CollectionItem[]
}

export interface CollectionRecord {
  uri: string
  cid: string
  value: CollectionValue
}

export interface ListCollectionsResponse {
  cursor?: string
  records: CollectionRecord[]
}

/**
 * List `org.hypercerts.collection` records on a DID's PDS with
 * cursor-based pagination. Returns an empty list (not an error) when
 * the user has never written a collection record — the PDS returns
 * 400 / 404 in that case.
 */
export async function fetchCollections(
  did: string,
  cursor?: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<ListCollectionsResponse> {
  const params = new URLSearchParams({
    repo: did,
    collection: COLLECTION,
    limit: String(limit),
    reverse: "true",
  })
  if (cursor) params.set("cursor", cursor)

  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    signal ? { signal } : undefined,
  )

  if (!res.ok) {
    if (res.status === 400 || res.status === 404) {
      return { records: [] }
    }
    throw new Error(`Failed to fetch collections: ${res.status}`)
  }

  const data = await res.json()
  return {
    records: data.records ?? [],
    cursor: data.cursor,
  }
}

// ---------------------------------------------------------------------------
// Endorsement-list collections — the curation overlay that replaced the
// per-list `app.certified.badge.definition` model.
// ---------------------------------------------------------------------------

function extractRkey(uri: string): string {
  const idx = uri.lastIndexOf("/")
  return idx >= 0 ? uri.slice(idx + 1) : uri
}

/**
 * Type-narrow a `CollectionValue` to `EndorsementListCollectionValue`.
 * Returns null for anything that doesn't carry the list discriminator
 * or is missing the required string fields. Read paths use this to
 * drop project records (or future, unknown collection types) silently.
 */
export function asEndorsementListValue(
  value: CollectionValue,
): EndorsementListCollectionValue | null {
  if (value.type !== ENDORSEMENT_LIST_TYPE) return null
  if (typeof value.title !== "string" || !value.title) return null
  if (typeof value.createdAt !== "string" || !value.createdAt) return null
  return value as EndorsementListCollectionValue
}

/**
 * Page through `fetchCollections` and return only endorsement-list
 * records on `did`'s PDS. Used by the lists hook + read paths. Walks
 * the cursor so very-prolific accounts (lists + projects together
 * exceeding one page) don't silently truncate.
 */
export async function listEndorsementListCollections(
  did: string,
  signal?: AbortSignal,
): Promise<
  Array<{
    uri: string
    cid: string
    rkey: string
    value: EndorsementListCollectionValue
  }>
> {
  const out: Array<{
    uri: string
    cid: string
    rkey: string
    value: EndorsementListCollectionValue
  }> = []
  let cursor: string | undefined
  do {
    const page = await fetchCollections(did, cursor, 50, signal)
    for (const r of page.records) {
      const narrow = asEndorsementListValue(r.value)
      if (!narrow) continue
      out.push({
        uri: r.uri,
        cid: r.cid,
        rkey: extractRkey(r.uri),
        value: narrow,
      })
    }
    cursor = page.cursor
  } while (cursor)
  return out
}

/**
 * Fetch a single `org.hypercerts.collection` record by rkey. Used by
 * the write helpers below to do read-modify-write on `items[]` (so
 * concurrent edits in different tabs only lose updates within the
 * same single round-trip window, matching the project flow's
 * lost-update profile).
 */
async function getCollectionRecord(
  did: string,
  rkey: string,
): Promise<{ value: CollectionValue; cid: string } | null> {
  const params = new URLSearchParams({
    repo: did,
    collection: COLLECTION,
    rkey,
  })
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
    { cache: "no-store" },
  )
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return null
    throw new Error(`Failed to read list record: ${res.status}`)
  }
  const data = (await res.json()) as { value?: CollectionValue; cid?: string }
  if (!data.value || !data.cid) return null
  return { value: data.value, cid: data.cid }
}

interface WriteResult {
  uri: string
  cid: string
}

/**
 * Create a new endorsement-list collection record on the viewer's
 * PDS. Title is required; description optional. Returns the new
 * record's strong ref so callers can mirror it in local state without
 * a re-read.
 */
export async function createEndorsementListCollection(
  ownDid: string,
  title: string,
  description?: string,
): Promise<WriteResult> {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error("List title is required")
  const trimmedDescription = description?.trim()
  const record: EndorsementListCollectionValue = {
    $type: COLLECTION,
    type: ENDORSEMENT_LIST_TYPE,
    title: trimmedTitle,
    createdAt: new Date().toISOString(),
    items: [],
  }
  if (trimmedDescription) record.description = trimmedDescription
  const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: COLLECTION,
      record,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    uri?: string
    cid?: string
    error?: string
  }
  if (!res.ok || !data.uri || !data.cid) {
    throw new Error(data.error || `Failed to create list: ${res.status}`)
  }
  return { uri: data.uri, cid: data.cid }
}

/**
 * Overwrite title/description on an existing endorsement-list. Does
 * read-modify-write so `createdAt`, `type`, and `items` round-trip
 * intact regardless of what the caller supplies. The XRPC proxy's
 * lexicon-validator + the magic-indexer pin nothing here, so we own
 * the contract.
 */
export async function updateEndorsementListCollection(
  ownDid: string,
  rkey: string,
  title: string,
  description?: string,
): Promise<WriteResult> {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error("List title is required")
  const existing = await getCollectionRecord(ownDid, rkey)
  if (!existing) throw new Error("List not found")
  const narrow = asEndorsementListValue(existing.value)
  if (!narrow) throw new Error("Record is not an endorsement-list")
  const trimmedDescription = description?.trim()
  const next: EndorsementListCollectionValue = {
    ...narrow,
    $type: COLLECTION,
    type: ENDORSEMENT_LIST_TYPE,
    title: trimmedTitle,
    createdAt: narrow.createdAt,
    description: trimmedDescription || undefined,
  }
  return putCollectionRecord(ownDid, rkey, next, existing.cid)
}

/**
 * Delete an endorsement-list collection record. Awards survive — see
 * `plan.md` for the semantics shift from the old badge-definition
 * model.
 */
export async function deleteEndorsementListCollection(
  ownDid: string,
  rkey: string,
): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: COLLECTION,
      rkey,
    }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `Failed to delete list: ${res.status}`)
  }
}

/**
 * Append a strongRef to the list's `items[]`, dedupe-on-URI so a
 * double-click can't double-add. Read-modify-write — concurrent tabs
 * editing the same list can still clobber each other (same risk
 * surface as the project items flow).
 *
 * Returns the new record's strong ref and a flag telling the caller
 * whether anything actually changed (so an unconditional refetch
 * after a no-op add is avoidable).
 */
export async function appendItemToList(
  ownDid: string,
  rkey: string,
  awardRef: ItemIdentifier,
): Promise<{ uri: string; cid: string; added: boolean }> {
  const existing = await getCollectionRecord(ownDid, rkey)
  if (!existing) throw new Error("List not found")
  const narrow = asEndorsementListValue(existing.value)
  if (!narrow) throw new Error("Record is not an endorsement-list")
  const currentItems = Array.isArray(narrow.items) ? narrow.items : []
  if (currentItems.some((it) => it.itemIdentifier?.uri === awardRef.uri)) {
    return { uri: existingUri(ownDid, rkey), cid: existing.cid, added: false }
  }
  const next: EndorsementListCollectionValue = {
    ...narrow,
    items: [
      ...currentItems,
      {
        itemIdentifier: { uri: awardRef.uri, cid: awardRef.cid },
        addedAt: new Date().toISOString(),
      },
    ],
  }
  const result = await putCollectionRecord(ownDid, rkey, next, existing.cid)
  return { ...result, added: true }
}

/**
 * Bulk variant of `appendItemToList`: append every entry in `awardRefs`
 * in a single read-modify-write on the list's collection record.
 *
 * Dedupe-on-URI both against the existing items and within the batch
 * itself — a caller that hands in 50 refs of which 5 are already in
 * the list ends up with 45 net additions, not a no-op or a dupes-
 * tolerated write. Returns the URI sets so the caller can surface
 * per-row status (added vs skipped-already-in) on the bulk UI.
 *
 * Mirrors `appendManyToTypedList` for the endorsement-list lexicon —
 * the only reason it's a separate function is the value shape
 * (`asEndorsementListValue` validation) and write-shape narrowing.
 */
export async function appendManyItemsToList(
  ownDid: string,
  rkey: string,
  awardRefs: readonly ItemIdentifier[],
): Promise<{ added: string[]; skippedAlreadyIn: string[] }> {
  const added: string[] = []
  const skippedAlreadyIn: string[] = []
  if (awardRefs.length === 0) return { added, skippedAlreadyIn }

  const existing = await getCollectionRecord(ownDid, rkey)
  if (!existing) throw new Error("List not found")
  const narrow = asEndorsementListValue(existing.value)
  if (!narrow) throw new Error("Record is not an endorsement-list")
  const currentItems = Array.isArray(narrow.items) ? narrow.items : []
  const present = new Set(
    currentItems
      .map((it) => it.itemIdentifier?.uri)
      .filter((u): u is string => typeof u === "string"),
  )

  const now = new Date().toISOString()
  const additions: { itemIdentifier: ItemIdentifier; addedAt: string }[] = []
  const seenInBatch = new Set<string>()
  for (const ref of awardRefs) {
    if (present.has(ref.uri) || seenInBatch.has(ref.uri)) {
      skippedAlreadyIn.push(ref.uri)
      continue
    }
    seenInBatch.add(ref.uri)
    additions.push({
      itemIdentifier: { uri: ref.uri, cid: ref.cid },
      addedAt: now,
    })
    added.push(ref.uri)
  }

  if (additions.length === 0) {
    return { added, skippedAlreadyIn }
  }

  const next: EndorsementListCollectionValue = {
    ...narrow,
    items: [...currentItems, ...additions],
  }
  await putCollectionRecord(ownDid, rkey, next, existing.cid)
  return { added, skippedAlreadyIn }
}

/**
 * Drop the entry whose `itemIdentifier.uri === awardUri` from the
 * list's `items[]`. No-op (with `removed: false`) if not found. Does
 * NOT delete the underlying award.
 */
export async function removeItemFromList(
  ownDid: string,
  rkey: string,
  awardUri: string,
): Promise<{ uri: string; cid: string; removed: boolean }> {
  const existing = await getCollectionRecord(ownDid, rkey)
  if (!existing) throw new Error("List not found")
  const narrow = asEndorsementListValue(existing.value)
  if (!narrow) throw new Error("Record is not an endorsement-list")
  const currentItems = Array.isArray(narrow.items) ? narrow.items : []
  const nextItems = currentItems.filter(
    (it) => it.itemIdentifier?.uri !== awardUri,
  )
  if (nextItems.length === currentItems.length) {
    return { uri: existingUri(ownDid, rkey), cid: existing.cid, removed: false }
  }
  const next: EndorsementListCollectionValue = { ...narrow, items: nextItems }
  const result = await putCollectionRecord(ownDid, rkey, next, existing.cid)
  return { ...result, removed: true }
}

/**
 * Scan every endorsement-list owned by `ownDid` and drop any item
 * whose `itemIdentifier.uri === awardUri`. Called by
 * `deleteEndorsementAward` so revoking an award from the Given panel
 * doesn't leave ghost rows on the issuer's lists.
 *
 * Errors on individual list edits are swallowed (best-effort cleanup
 * — the orphan-item read path drops unresolved items silently so a
 * partial failure here just delays cleanup, not data integrity).
 */
export async function purgeAwardFromLists(
  ownDid: string,
  awardUri: string,
): Promise<{ scanned: number; updated: number }> {
  const lists = await listEndorsementListCollections(ownDid)
  let updated = 0
  for (const list of lists) {
    const items = list.value.items
    if (!Array.isArray(items)) continue
    if (!items.some((it) => it.itemIdentifier?.uri === awardUri)) continue
    try {
      const result = await removeItemFromList(ownDid, list.rkey, awardUri)
      if (result.removed) updated++
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[collection] purgeAwardFromLists failed for list",
          list.rkey,
          err,
        )
      }
    }
  }
  return { scanned: lists.length, updated }
}

async function putCollectionRecord(
  ownDid: string,
  rkey: string,
  record: EndorsementListCollectionValue,
  swapRecord?: string,
): Promise<WriteResult> {
  const body: Record<string, unknown> = {
    repo: ownDid,
    collection: COLLECTION,
    rkey,
    record,
  }
  if (swapRecord) body.swapRecord = swapRecord
  const res = await authFetch("/api/xrpc/com/atproto/repo/putRecord", {
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
    throw new Error(data.error || `Failed to update list: ${res.status}`)
  }
  return { uri: data.uri, cid: data.cid }
}

function existingUri(ownDid: string, rkey: string): string {
  return `at://${ownDid}/${COLLECTION}/${rkey}`
}
