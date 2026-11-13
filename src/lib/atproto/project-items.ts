import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/urls"
import { putProjectRecord } from "@/lib/atproto/project"
import { InvalidSwapError } from "@/lib/atproto/repo-write"
import type { CollectionRecord, CollectionValue } from "@/lib/atproto/collection"
import { toUserErrorMessage } from "@/lib/utils/api"

/**
 * Adding activities to, and removing them from, the signed-in person's own
 * projects (`org.hypercerts.collection` with `type: "project"`).
 *
 * A project lists its activities in `items[]` as
 * `{ itemIdentifier: { uri, cid } }` strong refs (the shape `/project/new`
 * and the project edit page write). One activity can sit in several
 * projects, so adding never moves anything and removing never deletes the
 * activity.
 *
 * Personal repo only: every write goes through the XRPC proxy with
 * `repo` = the session DID (`putProjectRecord(did, did, …)` takes the own
 * path of `writeToRepo`), and a project URI on any other repo is refused
 * before anything is read. Group projects are edited on the project page.
 */

export const PROJECT_COLLECTION = "org.hypercerts.collection"

/** A strong ref to the record an item points at. */
export interface ItemRef {
  uri: string
  cid: string
}

export interface ItemChanges {
  /** Refs to append (skipped when the URI is already listed). */
  add?: readonly ItemRef[]
  /** URIs to drop (skipped when not listed). */
  remove?: readonly string[]
}

export interface AppliedItemChanges {
  /** The next `items` array. */
  items: unknown[]
  /** URIs that were actually appended. */
  added: string[]
  /** URIs that were actually dropped. */
  removed: string[]
}

/** The `itemIdentifier.uri` of one `items[]` entry, if it has one. */
function entryUri(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") return null
  const id = (entry as { itemIdentifier?: unknown }).itemIdentifier
  if (!id || typeof id !== "object") return null
  const uri = (id as { uri?: unknown }).uri
  return typeof uri === "string" ? uri : null
}

/** Every `itemIdentifier.uri` in a project's `items`, in order. */
export function itemUris(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const out: string[] = []
  for (const entry of items) {
    const uri = entryUri(entry)
    if (uri) out.push(uri)
  }
  return out
}

/**
 * Pure: apply `changes` to a project's `items`.
 *
 * - Existing entries keep their order and any extra fields (the lexicon
 *   allows more than `itemIdentifier`), and entries this page doesn't
 *   understand are kept as they are.
 * - Removal drops every entry with that URI (a project may hold
 *   duplicates).
 * - Additions are appended in the order given, once each, and only when
 *   the URI isn't already listed. A URI that is both removed and added
 *   ends up listed once, at the end.
 */
export function applyItemChanges(items: unknown, changes: ItemChanges): AppliedItemChanges {
  const current = Array.isArray(items) ? items : []
  const removeSet = new Set(changes.remove ?? [])
  const removed = new Set<string>()
  const next: unknown[] = []
  for (const entry of current) {
    const uri = entryUri(entry)
    if (uri && removeSet.has(uri)) {
      removed.add(uri)
      continue
    }
    next.push(entry)
  }
  const listed = new Set(itemUris(next))
  const added: string[] = []
  for (const ref of changes.add ?? []) {
    if (!ref.uri || !ref.cid || listed.has(ref.uri)) continue
    listed.add(ref.uri)
    added.push(ref.uri)
    next.push({ itemIdentifier: { uri: ref.uri, cid: ref.cid } })
  }
  // An entry that was removed and added back isn't a change.
  const addedSet = new Set(added)
  return {
    items: next,
    added: added.filter((u) => !removed.has(u)),
    removed: [...removed].filter((u) => !addedSet.has(u)),
  }
}

/** Parse a project URI and check it lives on `did`'s own repo. */
function ownProjectRkey(did: string, projectUri: string): string {
  const parsed = parseAtUri(projectUri)
  if (!parsed || parsed.collection !== PROJECT_COLLECTION) {
    throw new Error("That record isn't a project.")
  }
  if (parsed.did !== did) {
    throw new Error("Only projects on your personal account can be changed here.")
  }
  return parsed.rkey
}

/** Read one of `did`'s own projects from their PDS (the current version). */
export async function readOwnProject(
  did: string,
  projectUri: string,
): Promise<CollectionRecord> {
  const rkey = ownProjectRkey(did, projectUri)
  const qs = new URLSearchParams({ repo: did, collection: PROJECT_COLLECTION, rkey })
  const res = await authFetch(`/api/xrpc/com/atproto/repo/getRecord?${qs.toString()}`)
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(toUserErrorMessage(res.status, data.error, "Couldn't load the project. Try again"))
  }
  const data = (await res.json()) as { uri?: string; cid?: string; value?: CollectionValue }
  if (!data.cid || !data.value) throw new Error("Couldn't load the project. Try again")
  return { uri: data.uri ?? projectUri, cid: data.cid, value: data.value }
}

export interface UpdatedProjectItems {
  /** The project as written (or as read, when nothing changed). */
  record: CollectionRecord
  added: string[]
  removed: string[]
}

/**
 * Add and remove activities on one of the signed-in person's own projects,
 * in a single write. Reads the current record first and writes with
 * `swapRecord` set to its CID, so an edit made elsewhere in between is
 * never overwritten: the write is retried on the newer version (up to
 * `maxAttempts` reads in all). Nothing is written when nothing changes.
 *
 * Every other field of the project is kept as stored. An empty list drops
 * `items`, as the project edit page does.
 */
export async function updateOwnProjectItems(
  did: string,
  projectUri: string,
  changes: ItemChanges,
  opts: { maxAttempts?: number } = {},
): Promise<UpdatedProjectItems> {
  const rkey = ownProjectRkey(did, projectUri)
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3)
  for (let attempt = 1; ; attempt++) {
    const current = await readOwnProject(did, projectUri)
    const applied = applyItemChanges(current.value.items, changes)
    if (applied.added.length === 0 && applied.removed.length === 0) {
      return { record: current, added: [], removed: [] }
    }
    const next: CollectionValue = { ...current.value }
    if (applied.items.length > 0) next.items = applied.items
    else delete next.items
    try {
      const written = await putProjectRecord(did, did, rkey, next, {
        swapRecord: current.cid,
      })
      return {
        record: { uri: written.uri || projectUri, cid: written.cid, value: next },
        added: applied.added,
        removed: applied.removed,
      }
    } catch (err) {
      if (err instanceof InvalidSwapError && attempt < maxAttempts) continue
      if (err instanceof InvalidSwapError) {
        throw new Error("This project was changed somewhere else. Reload the page and try again.")
      }
      throw err
    }
  }
}

/** The lexicon's title bounds, as `/project/new` enforces them. */
export const PROJECT_TITLE_MIN = 5
export const PROJECT_TITLE_MAX = 80

/**
 * Create a project on the signed-in person's own repo holding `items`
 * (the "New project from selection" path). Same record shape as
 * `/project/new`; the description, banner and location can be added on the
 * project's edit page afterwards.
 */
export async function createOwnProject(
  did: string,
  input: { title: string; items: readonly ItemRef[] },
): Promise<CollectionRecord> {
  const title = input.title.trim()
  if (!title) throw new Error("Give the project a name.")
  const value: CollectionValue = {
    $type: PROJECT_COLLECTION,
    type: "project",
    title,
    createdAt: new Date().toISOString(),
  }
  const items = applyItemChanges([], { add: input.items }).items
  if (items.length > 0) value.items = items
  const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: did, collection: PROJECT_COLLECTION, record: value }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    uri?: string
    cid?: string
    error?: string
  }
  if (!res.ok || !data.uri || !data.cid) {
    throw new Error(
      toUserErrorMessage(res.status, data.error, "Couldn't create the project. Try again"),
    )
  }
  return { uri: data.uri, cid: data.cid, value }
}
