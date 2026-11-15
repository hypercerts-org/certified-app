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

/** A text that ends in "..." or "…": cut short where it was stored. */
function cutShort(s: string): string | null {
  const m = /^([\s\S]*?)\s*(?:\.{3}|…)$/.exec(s.trim())
  return m && m[1].trim().length > 0 ? m[1].trim() : null
}

/**
 * The lead a record page (or card) shows: the stored summary, unless it
 * was cut short in the data ("…instead of retaining, r...") and the
 * description starts with the same words; then the description's first
 * paragraph, whole. Without such a description, a stub of a word left at
 * the cut goes ("…instead of retaining, r..." -> "…instead of
 * retaining…"). Null when there is no summary.
 */
export function leadText(
  summary: string | null | undefined,
  description: unknown,
): string | null {
  const short = summary?.trim() || null
  if (!short) return null
  const stem = cutShort(short)
  if (!stem) return short
  const first = firstParagraphText(description)
  if (first && normalize(first).startsWith(normalize(stem)) && first.length > stem.length) {
    return first
  }
  // A one- to three-letter stub after a comma was cut mid-word: drop it.
  const stub = /^([\s\S]{20,}?)[,;:]\s+\p{L}{1,3}$/u.exec(stem)
  return stub ? `${stub[1]}…` : short
}

/** The first sentence of a text (up to ". ", "! " or "? "), or all of it. */
export function firstSentence(text: string): string {
  const m = /^([\s\S]+?[.!?])(?:\s|$)/.exec(text.trim())
  return (m ? m[1] : text).trim()
}

/**
 * An update's title and its teaser, without saying the same thing twice.
 * A title cut short in the data ("…harvested stormwate…") whose text the
 * body starts with becomes the body's first sentence; a body that opens
 * with the title loses that sentence.
 */
export function titleAndTeaser(
  title: string | null,
  teaser: string | null,
): { title: string | null; teaser: string | null } {
  if (!teaser) return { title, teaser }
  const body = teaser.trim()
  const sentence = firstSentence(body)
  const rest = body.slice(sentence.length).trim() || null
  if (!title) return { title, teaser: body }
  const stem = cutShort(title)
  if (stem && normalize(body).startsWith(normalize(stem))) {
    return { title: sentence, teaser: rest }
  }
  const t = normalize(title).replace(/[.!?]+$/, "")
  if (normalize(sentence).replace(/[.!?]+$/, "") === t) return { title, teaser: rest }
  return { title, teaser: body }
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
