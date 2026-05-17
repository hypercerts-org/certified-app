"use client"

import { Fragment, type ReactNode } from "react"

/**
 * Minimal renderer for `pub.leaflet.pages.linearDocument` descriptions.
 *
 * The lexicon (leaflet.pub/leaflet) defines a `blocks: [{ block, alignment? }]`
 * shape where each `block` is a discriminated union via `$type`. We
 * support the four most common variants used in cert descriptions:
 *
 *   - `pub.leaflet.blocks.header`         → <h3..h6>
 *   - `pub.leaflet.blocks.text`           → <p>
 *   - `pub.leaflet.blocks.unorderedList`  → <ul>
 *   - `pub.leaflet.blocks.orderedList`    → <ol>
 *
 * iframes, blockquotes, code, math, images and embedded posts are
 * intentionally skipped — the cert detail page doesn't have a
 * sanitised sandbox for arbitrary embeds, and the bundle cost of a
 * full leaflet renderer would dwarf the value here. We render the
 * recognised blocks and silently drop the rest.
 *
 * Facets (`{ index, features[] }` rich-text annotations) are ignored
 * for the same reason: rendering them safely needs the same link /
 * mention resolver the rest of the app uses, and that work isn't part
 * of this redesign pass. We fall back to `plaintext` for every block,
 * which is what the leaflet renderer falls back to as well.
 */

interface LeafletDocument {
  blocks?: LeafletBlockEntry[]
}

interface LeafletBlockEntry {
  block?: unknown
  alignment?: string
}

function getType(node: unknown): string | null {
  if (!node || typeof node !== "object") return null
  const t = (node as Record<string, unknown>).$type
  return typeof t === "string" ? t : null
}

function getPlaintext(node: unknown): string {
  if (!node || typeof node !== "object") return ""
  const p = (node as Record<string, unknown>).plaintext
  return typeof p === "string" ? p : ""
}

/**
 * Recognise the linearDocument shape. We accept either a raw blocks
 * array (common in the wild — some records strip the outer object) or
 * the `{ $type: "pub.leaflet.pages.linearDocument", blocks }` wrapper.
 */
function asLinearDocument(value: unknown): LeafletDocument | null {
  if (!value || typeof value !== "object") return null
  const obj = value as Record<string, unknown>
  const type = obj.$type
  if (Array.isArray(obj.blocks)) {
    return { blocks: obj.blocks as LeafletBlockEntry[] }
  }
  if (
    typeof type === "string" &&
    type.startsWith("pub.leaflet.pages.linearDocument") &&
    Array.isArray(obj.blocks)
  ) {
    return { blocks: obj.blocks as LeafletBlockEntry[] }
  }
  return null
}

interface LeafletDocumentProps {
  /** The raw `value.description` from the cert record. */
  value: unknown
}

/**
 * Render a description value. Strings are rendered as a single
 * preformatted paragraph; structured leaflet documents are walked
 * block-by-block. Returns null when the value is empty / unrecognised
 * so callers can hide their wrapper.
 */
export default function LeafletDocument({ value }: LeafletDocumentProps) {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0) return null
    return <p className="cert-detail__description">{value}</p>
  }

  const doc = asLinearDocument(value)
  if (!doc || !doc.blocks || doc.blocks.length === 0) return null

  const rendered: ReactNode[] = []
  doc.blocks.forEach((entry, i) => {
    const node = renderBlock(entry.block, `b-${i}`)
    if (node) rendered.push(node)
  })

  if (rendered.length === 0) return null

  return <div className="cert-detail__leaflet">{rendered}</div>
}

function renderBlock(block: unknown, key: string): ReactNode {
  const type = getType(block)
  if (!type) return null

  if (type === "pub.leaflet.blocks.header") {
    const obj = block as Record<string, unknown>
    const rawLevel = obj.level
    const level =
      typeof rawLevel === "number" && rawLevel >= 1 && rawLevel <= 6
        ? Math.floor(rawLevel)
        : 3
    const text = getPlaintext(block)
    if (!text) return null
    // Map levels 1..6 → h2..h6 so we never collide with the page's
    // existing <h1>. Level 1 also becomes h2 since the cert title
    // already occupies h1.
    const Tag = (`h${Math.max(2, Math.min(6, level + 1))}` as unknown) as
      | "h2"
      | "h3"
      | "h4"
      | "h5"
      | "h6"
    return (
      <Tag key={key} className="cert-detail__leaflet-heading">
        {text}
      </Tag>
    )
  }

  if (type === "pub.leaflet.blocks.text") {
    const text = getPlaintext(block)
    if (!text) return null
    return (
      <p key={key} className="cert-detail__leaflet-para">
        {text}
      </p>
    )
  }

  if (type === "pub.leaflet.blocks.unorderedList") {
    const obj = block as Record<string, unknown>
    const items = renderListChildren(obj.children, false)
    if (!items) return null
    return (
      <ul key={key} className="cert-detail__leaflet-list">
        {items}
      </ul>
    )
  }

  if (type === "pub.leaflet.blocks.orderedList") {
    const obj = block as Record<string, unknown>
    const startRaw = obj.startIndex
    const start =
      typeof startRaw === "number" && Number.isFinite(startRaw)
        ? Math.floor(startRaw)
        : 1
    const items = renderListChildren(obj.children, true)
    if (!items) return null
    return (
      <ol
        key={key}
        className="cert-detail__leaflet-list"
        start={start === 1 ? undefined : start}
      >
        {items}
      </ol>
    )
  }

  // Unrecognised block — silently skip.
  return null
}

function renderListChildren(
  children: unknown,
  ordered: boolean,
): ReactNode[] | null {
  if (!Array.isArray(children) || children.length === 0) return null
  const nodes: ReactNode[] = []
  children.forEach((item, i) => {
    if (!item || typeof item !== "object") return
    const obj = item as Record<string, unknown>
    const content = obj.content
    const contentText = getPlaintext(content) || ""
    // Recurse into nested lists. `children` wins when both are set per
    // the lexicon's "mutually exclusive; children takes precedence" rule.
    const nested =
      Array.isArray(obj.children) && obj.children.length > 0
        ? renderListChildren(obj.children, false)
        : obj.orderedListChildren && typeof obj.orderedListChildren === "object"
          ? renderListChildren(
              (obj.orderedListChildren as Record<string, unknown>).children,
              true,
            )
          : null

    nodes.push(
      <li key={`${ordered ? "o" : "u"}-${i}`}>
        <Fragment>{contentText}</Fragment>
        {nested ? (
          ordered ? (
            <ol className="cert-detail__leaflet-list">{nested}</ol>
          ) : (
            <ul className="cert-detail__leaflet-list">{nested}</ul>
          )
        ) : null}
      </li>,
    )
  })
  if (nodes.length === 0) return null
  return nodes
}

/**
 * True when the raw value can be rendered with this component
 * (non-empty string or recognised linear document with at least one
 * block). The caller can hide its wrapper section when this is false.
 */
export function isRenderableDescription(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0
  const doc = asLinearDocument(value)
  return !!doc && Array.isArray(doc.blocks) && doc.blocks.length > 0
}
