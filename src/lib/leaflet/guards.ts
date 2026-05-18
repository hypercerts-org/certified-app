import type {
  LinearDocument,
  LinearBlockEntry,
  StrongRef,
} from "./types"
import { LINEAR_DOC_TYPE } from "./types"

/**
 * Recognise a value as a leaflet linear document. Accepts both the
 * canonical `{ $type: "pub.leaflet.pages.linearDocument", blocks }`
 * shape and the bare-blocks shape seen in some legacy records.
 */
export function asLinearDocument(value: unknown): LinearDocument | null {
  if (!value || typeof value !== "object") return null
  const obj = value as Record<string, unknown>
  const blocks = obj.blocks
  if (!Array.isArray(blocks)) return null
  const type = obj.$type
  if (type !== undefined && type !== LINEAR_DOC_TYPE) {
    // Some records may carry a slightly different `$type` (e.g. the
    // version suffix `...linearDocument#v1`). Accept anything that
    // starts with the canonical id — strict equality is too narrow.
    if (typeof type !== "string" || !type.startsWith(LINEAR_DOC_TYPE)) {
      return null
    }
  }
  return {
    $type: LINEAR_DOC_TYPE,
    blocks: blocks as LinearBlockEntry[],
  }
}

/** True when the value is a strong-ref `{ uri, cid }`. */
export function asStrongRef(value: unknown): StrongRef | null {
  if (!value || typeof value !== "object") return null
  const obj = value as Record<string, unknown>
  if (typeof obj.uri !== "string" || typeof obj.cid !== "string") return null
  return { uri: obj.uri, cid: obj.cid }
}

/** True when the renderer can produce non-empty output for this value. */
export function isRenderableLongDescription(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0
  const doc = asLinearDocument(value)
  if (doc && doc.blocks.length > 0) return true
  // Strong refs are renderable (as a "see linked document" affordance)
  // but the inline renderer doesn't fetch them; callers must resolve
  // first. Treat as non-renderable here.
  return false
}

/** True when the value is "empty" — useful for the save handler to
 *  decide between persisting the field or dropping it entirely. */
export function isEmptyLongDescription(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim().length === 0
  const doc = asLinearDocument(value)
  if (!doc) return true
  if (doc.blocks.length === 0) return true
  // All blocks are empty text / list with empty items → treat as empty.
  return doc.blocks.every((entry) => {
    const block = entry.block as unknown as Record<string, unknown>
    const type = block.$type
    if (type === "pub.leaflet.blocks.text" || type === "pub.leaflet.blocks.header") {
      const text = block.plaintext
      return typeof text !== "string" || text.trim().length === 0
    }
    const children = block.children
    return !Array.isArray(children) || children.length === 0
  })
}
