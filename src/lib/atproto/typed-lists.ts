/**
 * Typed-list collection records. Sibling concept to the
 * endorsement-list flow (see `collection.ts`) — both live in the
 * `org.hypercerts.collection` lexicon and differ only in the `type`
 * discriminator + the lexicons their `items[i].itemIdentifier.uri`
 * is allowed to point at.
 *
 * Three list types are surfaced today, one per profile-page section:
 *
 *   - `list:certs`     — items must be `org.hypercerts.claim.activity`
 *                        records.
 *   - `list:projects`  — items must be `org.hypercerts.collection`
 *                        records with `value.type === "project"`.
 *   - `list:accounts`  — items must be `app.certified.actor.profile`
 *                        records.
 *
 * Server-side enforcement is loose (the lexicon allows any URI in
 * items[]); the client validates at add time and silently drops
 * mismatched items at read time so a manipulated record doesn't
 * surface as a typo'd row.
 */
import { authFetch } from "@/lib/auth/fetch"
import { invalidateEndorsementLists } from "@/lib/atproto/endorsement-lists-cache"
import type {
  CollectionValue,
  ItemIdentifier,
} from "@/lib/atproto/collection"

const COLLECTION = "org.hypercerts.collection"

export const LIST_CERTS_TYPE = "list:certs"
export const LIST_PROJECTS_TYPE = "list:projects"
export const LIST_ACCOUNTS_TYPE = "list:accounts"

export const TYPED_LIST_TYPES = [
  LIST_CERTS_TYPE,
  LIST_PROJECTS_TYPE,
  LIST_ACCOUNTS_TYPE,
] as const
export type TypedListType = (typeof TYPED_LIST_TYPES)[number]

/** AT-URI collection name expected on `items[i].itemIdentifier.uri`
 *  for each list type. The cert / project / account distinction is
 *  enforced purely at the at:// path-prefix level — we don't need
 *  to resolve the referenced record to know it's of the wrong shape. */
export const ITEM_NSID: Record<TypedListType, string> = {
  [LIST_CERTS_TYPE]: "org.hypercerts.claim.activity",
  [LIST_PROJECTS_TYPE]: "org.hypercerts.collection",
  [LIST_ACCOUNTS_TYPE]: "app.certified.actor.profile",
}

export interface TypedListValue extends CollectionValue {
  type: TypedListType
  title: string
  description?: string
  createdAt: string
  items?: { itemIdentifier: ItemIdentifier; addedAt?: string }[]
}

export interface TypedListRecord {
  uri: string
  cid: string
  rkey: string
  title: string
  description?: string
  createdAt: string
  type: TypedListType
  items: { itemIdentifier: ItemIdentifier; addedAt?: string }[]
}

/** Return the `rkey` slice of `at://<did>/<collection>/<rkey>`. */
export function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? ""
}

/** Check that an at:// URI targets the lexicon expected by the list type. */
export function itemUriMatchesType(uri: string, listType: TypedListType): boolean {
  const nsid = ITEM_NSID[listType]
  // `at://<did>/<nsid>/<rkey>` — split on "/" gives ["at:", "", did, nsid, rkey].
  const parts = uri.split("/")
  return parts.length >= 5 && parts[3] === nsid
}

interface RawCollectionsResponse {
  records?: { uri: string; cid: string; value: unknown }[]
  cursor?: string
}

/** Read every `org.hypercerts.collection` record on a DID's PDS that
 *  matches one of the typed-list discriminators. Paginates until the
 *  PDS returns an empty page. Returns records narrowed + sorted
 *  newest-first by `createdAt`. */
export async function fetchTypedLists(
  did: string,
  signal?: AbortSignal,
): Promise<TypedListRecord[]> {
  const out: TypedListRecord[] = []
  let cursor: string | undefined
  while (true) {
    const params = new URLSearchParams({
      repo: did,
      collection: COLLECTION,
      limit: "100",
      reverse: "true",
    })
    if (cursor) params.set("cursor", cursor)
    const res = await authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
      { signal },
    )
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) break
      throw new Error(`Failed to read collections: ${res.status}`)
    }
    const json = (await res.json()) as RawCollectionsResponse
    for (const r of json.records ?? []) {
      const value = r.value as CollectionValue
      if (!isTypedList(value)) continue
      out.push(narrow(r.uri, r.cid, value))
    }
    if (!json.cursor) break
    cursor = json.cursor
  }
  return out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
}

function isTypedList(value: CollectionValue): value is TypedListValue {
  if (!value || typeof value !== "object") return false
  if (typeof value.title !== "string" || typeof value.createdAt !== "string") return false
  return TYPED_LIST_TYPES.includes(value.type as TypedListType)
}

function narrow(uri: string, cid: string, value: TypedListValue): TypedListRecord {
  return {
    uri,
    cid,
    rkey: rkeyFromUri(uri),
    title: value.title,
    description: value.description,
    createdAt: value.createdAt,
    type: value.type,
    items: Array.isArray(value.items)
      ? value.items.filter((it) => it?.itemIdentifier?.uri && it?.itemIdentifier?.cid)
      : [],
  }
}

interface WriteResult {
  uri: string
  cid: string
}

async function getRecord(
  ownDid: string,
  rkey: string,
): Promise<{ value: TypedListValue; cid: string } | null> {
  const params = new URLSearchParams({
    repo: ownDid,
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
  if (!isTypedList(data.value)) return null
  return { value: data.value, cid: data.cid }
}

async function putRecord(
  ownDid: string,
  rkey: string,
  value: TypedListValue,
  swapRecord: string,
): Promise<WriteResult> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/putRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection: COLLECTION,
      rkey,
      record: value,
      swapRecord,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    uri?: string
    cid?: string
    error?: string
  }
  if (!res.ok || !data.uri || !data.cid) {
    throw new Error(data.error || `Failed to write list: ${res.status}`)
  }
  return { uri: data.uri, cid: data.cid }
}

export async function createTypedList(
  ownDid: string,
  type: TypedListType,
  title: string,
  description?: string,
): Promise<WriteResult> {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error("List title is required")
  const record: TypedListValue = {
    $type: COLLECTION,
    type,
    title: trimmedTitle,
    createdAt: new Date().toISOString(),
    items: [],
  }
  const trimmedDescription = description?.trim()
  if (trimmedDescription) record.description = trimmedDescription
  const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: ownDid, collection: COLLECTION, record }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    uri?: string
    cid?: string
    error?: string
  }
  if (!res.ok || !data.uri || !data.cid) {
    throw new Error(data.error || `Failed to create list: ${res.status}`)
  }
  invalidateEndorsementLists()
  return { uri: data.uri, cid: data.cid }
}

/**
 * Overwrite the title / description on an existing typed list.
 * Read-modify-write so `type`, `createdAt`, and `items[]` round-
 * trip intact regardless of what the caller supplies. Throws if
 * the record doesn't exist or carries a different list type than
 * the caller expects (defensive — refuses to rewrite a list:certs
 * record as a list:projects record by accident).
 */
export async function updateTypedList(
  ownDid: string,
  rkey: string,
  expectedType: TypedListType,
  title: string,
  description?: string,
): Promise<WriteResult> {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error("List title is required")
  const existing = await getRecord(ownDid, rkey)
  if (!existing) throw new Error("List not found")
  if (existing.value.type !== expectedType) {
    throw new Error("List type mismatch")
  }
  const trimmedDescription = description?.trim()
  const next: TypedListValue = {
    ...existing.value,
    $type: COLLECTION,
    title: trimmedTitle,
    description: trimmedDescription || undefined,
  }
  const result = await putRecord(ownDid, rkey, next, existing.cid)
  invalidateEndorsementLists()
  return result
}

export async function deleteTypedList(ownDid: string, rkey: string): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: ownDid, collection: COLLECTION, rkey }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `Failed to delete list: ${res.status}`)
  }
  invalidateEndorsementLists()
}

export async function appendToTypedList(
  ownDid: string,
  rkey: string,
  item: ItemIdentifier,
  expectedType: TypedListType,
): Promise<{ added: boolean }> {
  if (!itemUriMatchesType(item.uri, expectedType)) {
    throw new Error(
      `Item ${item.uri} doesn't match the list type ${expectedType}`,
    )
  }
  const existing = await getRecord(ownDid, rkey)
  if (!existing) throw new Error("List not found")
  if (existing.value.type !== expectedType) {
    throw new Error("List type mismatch")
  }
  const currentItems = Array.isArray(existing.value.items) ? existing.value.items : []
  if (currentItems.some((it) => it.itemIdentifier?.uri === item.uri)) {
    return { added: false }
  }
  const next: TypedListValue = {
    ...existing.value,
    items: [
      ...currentItems,
      { itemIdentifier: { uri: item.uri, cid: item.cid }, addedAt: new Date().toISOString() },
    ],
  }
  await putRecord(ownDid, rkey, next, existing.cid)
  invalidateEndorsementLists()
  return { added: true }
}

/**
 * Bulk-append items to a typed list in a single read-modify-write.
 * Items that don't match the list type or are already present are
 * silently dropped (and counted in the return value) — the loop
 * never throws for individual mismatches so a single bad URI in a
 * paste doesn't tank the whole batch. The PDS write itself can
 * still throw on swap conflict or quota; that's surfaced to the
 * caller as-is.
 *
 * Pairs with `removeManyFromTypedList` — together they collapse
 * the previous per-item RMW loops in the bulk flows into a single
 * round-trip each.
 */
export async function appendManyToTypedList(
  ownDid: string,
  rkey: string,
  items: readonly ItemIdentifier[],
  expectedType: TypedListType,
): Promise<{ added: string[]; skippedAlreadyIn: string[]; skippedWrongType: string[] }> {
  const added: string[] = []
  const skippedAlreadyIn: string[] = []
  const skippedWrongType: string[] = []
  if (items.length === 0) return { added, skippedAlreadyIn, skippedWrongType }

  const existing = await getRecord(ownDid, rkey)
  if (!existing) throw new Error("List not found")
  if (existing.value.type !== expectedType) {
    throw new Error("List type mismatch")
  }
  const currentItems = Array.isArray(existing.value.items) ? existing.value.items : []
  const present = new Set(currentItems.map((it) => it.itemIdentifier?.uri).filter(Boolean) as string[])

  const now = new Date().toISOString()
  const additions: { itemIdentifier: ItemIdentifier; addedAt: string }[] = []
  const seenInBatch = new Set<string>()
  for (const item of items) {
    if (!itemUriMatchesType(item.uri, expectedType)) {
      skippedWrongType.push(item.uri)
      continue
    }
    if (present.has(item.uri) || seenInBatch.has(item.uri)) {
      skippedAlreadyIn.push(item.uri)
      continue
    }
    seenInBatch.add(item.uri)
    additions.push({
      itemIdentifier: { uri: item.uri, cid: item.cid },
      addedAt: now,
    })
    added.push(item.uri)
  }

  if (additions.length === 0) {
    return { added, skippedAlreadyIn, skippedWrongType }
  }

  const next: TypedListValue = {
    ...existing.value,
    items: [...currentItems, ...additions],
  }
  await putRecord(ownDid, rkey, next, existing.cid)
  invalidateEndorsementLists()
  return { added, skippedAlreadyIn, skippedWrongType }
}

export async function removeFromTypedList(
  ownDid: string,
  rkey: string,
  itemUri: string,
): Promise<{ removed: boolean }> {
  const existing = await getRecord(ownDid, rkey)
  if (!existing) throw new Error("List not found")
  const currentItems = Array.isArray(existing.value.items) ? existing.value.items : []
  const filtered = currentItems.filter((it) => it.itemIdentifier?.uri !== itemUri)
  if (filtered.length === currentItems.length) return { removed: false }
  const next: TypedListValue = { ...existing.value, items: filtered }
  await putRecord(ownDid, rkey, next, existing.cid)
  invalidateEndorsementLists()
  return { removed: true }
}

/**
 * Bulk-remove every entry whose URI appears in `itemUris` from a
 * typed list in a single read-modify-write. Much cheaper than the
 * per-item version when the viewer selects many items at once:
 * one getRecord + one putRecord regardless of count, vs. 2N RTTs
 * for the per-item loop. `swapRecord` still protects against
 * concurrent edits — if another tab mutated the list between the
 * read and the write, the PDS rejects the put and the caller
 * surfaces an error.
 */
export async function removeManyFromTypedList(
  ownDid: string,
  rkey: string,
  itemUris: readonly string[],
): Promise<{ removed: number }> {
  if (itemUris.length === 0) return { removed: 0 }
  const existing = await getRecord(ownDid, rkey)
  if (!existing) throw new Error("List not found")
  const dropSet = new Set(itemUris)
  const currentItems = Array.isArray(existing.value.items) ? existing.value.items : []
  const filtered = currentItems.filter(
    (it) => !dropSet.has(it.itemIdentifier?.uri ?? ""),
  )
  const removed = currentItems.length - filtered.length
  if (removed === 0) return { removed: 0 }
  const next: TypedListValue = { ...existing.value, items: filtered }
  await putRecord(ownDid, rkey, next, existing.cid)
  invalidateEndorsementLists()
  return { removed }
}

/**
 * Resolve a record's current CID via the XRPC proxy. Returns null
 * when the URI is malformed or the record doesn't exist. Used by
 * any caller that has an at:// URI but needs to write a strongRef
 * to it (the strongRef's CID has to match the latest record on the
 * referenced PDS).
 *
 * Lives here rather than each component's local helper file so the
 * cert / project / profile "Add to list" menu, the bulk-paste
 * modal, and the search-based add modal all share one
 * implementation.
 */
export async function resolveRecordCid(uri: string): Promise<string | null> {
  const parts = uri.split("/")
  if (parts.length < 5) return null
  const [, , repo, collection, rkey] = parts
  if (!repo || !collection || !rkey) return null
  const params = new URLSearchParams({ repo, collection, rkey })
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
    { cache: "no-store" },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { cid?: string }
  return data.cid ?? null
}
