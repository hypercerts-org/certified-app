/**
 * Record pages show the short description as the lead under the title and
 * the long description below. Many records repeat the short description as
 * the long one's first paragraph, which then reads twice. These helpers
 * drop that first paragraph when it says the same as the lead.
 */

import { BLOCK_HEADER as HEADER_BLOCK, BLOCK_TEXT as TEXT_BLOCK } from "./types"

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

/**
 * The first paragraph of a description as plain text: a string's first
 * paragraph, a Leaflet document's first text block. Null when there is
 * none (an embed or image first is skipped over). For short previews.
 */
export function firstParagraphText(value: unknown): string | null {
  if (typeof value === "string") {
    const para = value.split(/\n\s*\n/).find((p) => p.trim().length > 0)
    return para ? para.trim() : null
  }
  if (!value || typeof value !== "object") return null
  const blocks = (value as { blocks?: unknown }).blocks
  if (!Array.isArray(blocks)) return null
  for (const entry of blocks as { block?: { $type?: unknown; plaintext?: unknown } }[]) {
    const b = entry?.block
    if (b?.$type === TEXT_BLOCK && typeof b.plaintext === "string" && b.plaintext.trim()) {
      return b.plaintext.trim()
    }
  }
  return null
}

/**
 * The description without a first paragraph equal to `lead` (ignoring case
 * and spacing). A plain string loses its first paragraph, a Leaflet
 * linear document its first text block. Returns null when nothing is left,
 * and the value unchanged in every other case (other shapes included).
 */
export function withoutLeadParagraph(value: unknown, lead: string | null | undefined): unknown {
  const target = lead ? normalize(lead) : ""
  if (!target) return value

  if (typeof value === "string") {
    const paras = value.split(/\n\s*\n/)
    const first = paras.findIndex((p) => p.trim().length > 0)
    if (first === -1 || normalize(paras[first]) !== target) return value
    const rest = paras.slice(first + 1).join("\n\n").trim()
    return rest.length > 0 ? rest : null
  }

  if (!value || typeof value !== "object") return value
  const doc = value as { blocks?: unknown }
  if (!Array.isArray(doc.blocks)) return value
  const blocks = doc.blocks as { block?: { $type?: unknown; plaintext?: unknown } }[]
  const isWords = (t: unknown) => t === TEXT_BLOCK || t === HEADER_BLOCK
  const first = blocks.findIndex((entry) => {
    const b = entry?.block
    if (!b) return false
    if (isWords(b.$type)) {
      return typeof b.plaintext === "string" && b.plaintext.trim().length > 0
    }
    return true
  })
  if (first === -1) return value
  const block = blocks[first]?.block
  // A paragraph or a heading that says the same as the lead.
  if (!isWords(block?.$type) || typeof block?.plaintext !== "string") return value
  if (normalize(block.plaintext) !== target) return value
  const rest = blocks.slice(first + 1)
  if (rest.length === 0) return null
  return { ...(value as Record<string, unknown>), blocks: rest }
}
