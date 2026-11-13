import { parseAtUri } from "@/lib/atproto/activity-uri"

const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"

/**
 * One activity in the project editor's list. `raw` is the project's own
 * `items[]` entry for an activity that was already in the project, so a
 * save writes it back as it was (with any `itemWeight` or other fields);
 * it is null for an activity added in this edit.
 */
export interface ProjectItemRow {
  uri: string
  cid: string
  raw: unknown
}

/** The strong ref of an `items[]` entry, or null when it has none. */
function itemRef(entry: unknown): { uri: string; cid: string } | null {
  if (!entry || typeof entry !== "object") return null
  const id = (entry as { itemIdentifier?: unknown }).itemIdentifier
  if (!id || typeof id !== "object") return null
  const { uri, cid } = id as { uri?: unknown; cid?: unknown }
  if (typeof uri !== "string" || typeof cid !== "string") return null
  return { uri, cid }
}

/** Whether an `items[]` entry points at an activity record. */
function isActivityEntry(entry: unknown): boolean {
  const ref = itemRef(entry)
  return !!ref && parseAtUri(ref.uri)?.collection === ACTIVITY_COLLECTION
}

/**
 * The editor's list, read straight from the project record: every
 * activity entry, in the project's order, once each. Entries that aren't
 * activities are left out of the list (the editor can't show them) and
 * kept on save by `nextProjectItems`.
 */
export function itemRowsFromRecord(items: unknown): ProjectItemRow[] {
  if (!Array.isArray(items)) return []
  const seen = new Set<string>()
  const rows: ProjectItemRow[] = []
  for (const entry of items) {
    if (!isActivityEntry(entry)) continue
    const ref = itemRef(entry)!
    if (seen.has(ref.uri)) continue
    seen.add(ref.uri)
    rows.push({ uri: ref.uri, cid: ref.cid, raw: entry })
  }
  return rows
}

/**
 * The `items[]` to save. When the editor's list still matches the
 * project's activities (same ones, same order), the original array is
 * returned untouched. Otherwise the list's activities come first, in the
 * list's order (existing ones as they were, added ones as new strong
 * refs), followed by the project's entries that aren't activities. Returns
 * undefined when nothing is left, so the field can be dropped.
 */
export function nextProjectItems(
  originalItems: unknown,
  rows: readonly ProjectItemRow[],
): unknown[] | undefined {
  const original = Array.isArray(originalItems) ? originalItems : []
  const originalActivityUris = original
    .filter(isActivityEntry)
    .map((entry) => itemRef(entry)!.uri)
  const unchanged =
    rows.length === originalActivityUris.length &&
    rows.every((row, i) => row.uri === originalActivityUris[i])
  if (unchanged) return original.length > 0 ? original : undefined

  const next = [
    ...rows.map((row) => row.raw ?? { itemIdentifier: { uri: row.uri, cid: row.cid } }),
    ...original.filter((entry) => !isActivityEntry(entry)),
  ]
  return next.length > 0 ? next : undefined
}
