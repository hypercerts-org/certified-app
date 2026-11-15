import type {
  LinearDocument,
  LinearBlockEntry,
} from "./types"
import { BLOCK_TEXT, LINEAR_DOC_TYPE } from "./types"

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

/** `$type` of the plain-text arm of the long-description union. */
export const DESCRIPTION_STRING_TYPE = "org.hypercerts.defs#descriptionString"

/**
 * The text of an `org.hypercerts.defs#descriptionString` value (`{ $type,
 * value, facets? }`), the shape other clients write for an account's or a
 * record's long description. Null for anything else.
 */
export function descriptionStringText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const obj = value as Record<string, unknown>
  if (typeof obj.value !== "string") return null
  // The `$type` is optional on the wire inside an open union; accept the
  // bare `{ value }` shape too, but never a leaflet document.
  if (obj.$type !== undefined && obj.$type !== DESCRIPTION_STRING_TYPE) return null
  if (Array.isArray(obj.blocks)) return null
  return obj.value
}

/**
 * Split plain text into paragraphs: blank lines separate them, single line
 * breaks stay inside a paragraph. Trims each one and drops empty ones.
 */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Any stored long description (a plain string, a descriptionString object,
 * or a leaflet document) as a leaflet linear document, so the editor and the
 * renderer have one shape to work with. Plain text becomes one text block
 * per paragraph. Null when there is nothing to show.
 */
export function longDescriptionToLinearDocument(value: unknown): LinearDocument | null {
  const doc = asLinearDocument(value)
  if (doc) return doc
  const text = typeof value === "string" ? value : descriptionStringText(value)
  if (text === null) return null
  const paragraphs = splitParagraphs(text)
  if (paragraphs.length === 0) return null
  return {
    $type: LINEAR_DOC_TYPE,
    blocks: paragraphs.map((plaintext) => ({
      block: { $type: BLOCK_TEXT, plaintext },
    })),
  }
}

/**
 * The plain text of a long description, paragraphs separated by a blank
 * line (headings and list items count as paragraphs). For share previews
 * and other text-only surfaces. Null when empty.
 */
export function longDescriptionPlainText(value: unknown): string | null {
  const doc = longDescriptionToLinearDocument(value)
  if (!doc) return null
  const parts: string[] = []
  for (const entry of doc.blocks) {
    const block = entry?.block as unknown as Record<string, unknown> | undefined
    if (!block) continue
    if (typeof block.plaintext === "string") {
      const t = block.plaintext.trim()
      if (t) parts.push(t)
      continue
    }
    if (Array.isArray(block.children)) {
      for (const item of block.children as { content?: { plaintext?: unknown } }[]) {
        const t = typeof item?.content?.plaintext === "string" ? item.content.plaintext.trim() : ""
        if (t) parts.push(t)
      }
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null
}

/** True when the value is "empty" — useful for the save handler to
 *  decide between persisting the field or dropping it entirely. */
export function isEmptyLongDescription(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim().length === 0
  const described = descriptionStringText(value)
  if (described !== null) return described.trim().length === 0
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
