"use client"

import { Fragment, type ReactNode } from "react"
import { asLinearDocument } from "@/lib/leaflet/guards"
import { isAllowedEmbedHost } from "@/lib/leaflet/embed-url"
import {
  BLOCK_HEADER,
  BLOCK_IFRAME,
  BLOCK_IMAGE,
  BLOCK_OL,
  BLOCK_TEXT,
  BLOCK_UL,
  FEATURE_BOLD,
  FEATURE_ITALIC,
  FEATURE_LINK,
  type Facet,
  type IframeBlock,
  type ImageBlock,
  type LinearBlock,
  type ListItem,
} from "@/lib/leaflet/types"

/**
 * Renderer for `pub.leaflet.pages.linearDocument` values. Walks the
 * canonical block / facet shape and emits a small, accessible HTML
 * tree:
 *
 *   - `pub.leaflet.blocks.header`        → <h2>..<h6>
 *   - `pub.leaflet.blocks.text`          → <p>
 *   - `pub.leaflet.blocks.unorderedList` → <ul>
 *   - `pub.leaflet.blocks.orderedList`   → <ol>
 *
 * Inline facets `bold`, `italic`, `link` are rendered as <strong>,
 * <em>, <a> wrappers around the appropriate byte-indexed text runs.
 *
 * iframes, images, math, embeds, quotes and other block types are
 * intentionally skipped — the app doesn't have a sandboxed sandbox
 * for arbitrary embeds, and the bundle cost of a full leaflet
 * renderer would dwarf the value here.
 *
 * Class names use the neutral `leaflet-doc__*` namespace so the
 * renderer works on any surface; pass `className` (or wrap with your
 * own container class) to layer surface-specific styling on top.
 */

export interface LeafletDocumentProps {
  /** Raw value from the record (string fallback, linearDocument, or
   *  legacy bare-blocks shape — all accepted). */
  value: unknown
  /** Extra class for the outer wrapper. The default class is
   *  `leaflet-doc`; both apply when this is provided. */
  className?: string
  /** Lowest heading level emitted. Defaults to `2` so blocks don't
   *  collide with the surrounding page's `<h1>`. */
  minHeadingLevel?: 2 | 3 | 4
  /** DID of the repo that owns this document. Required to resolve
   *  `pub.leaflet.blocks.image` blob refs to `getBlob` URLs; images
   *  are silently skipped when this is missing. */
  did?: string
}

export default function LeafletDocument({
  value,
  className,
  minHeadingLevel = 2,
  did,
}: LeafletDocumentProps) {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0) return null
    return (
      <p className={joinClass("leaflet-doc__para", className)}>
        {value}
      </p>
    )
  }

  const doc = asLinearDocument(value)
  if (!doc || doc.blocks.length === 0) return null

  const rendered: ReactNode[] = []
  doc.blocks.forEach((entry, i) => {
    const node = renderBlock(entry?.block, `b-${i}`, minHeadingLevel, did)
    if (node) rendered.push(node)
  })

  if (rendered.length === 0) return null
  return <div className={joinClass("leaflet-doc", className)}>{rendered}</div>
}

function joinClass(base: string, extra: string | undefined): string {
  return extra ? `${base} ${extra}` : base
}

function renderBlock(
  block: unknown,
  key: string,
  minHeading: number,
  did?: string,
): ReactNode {
  if (!block || typeof block !== "object") return null
  const type = (block as Record<string, unknown>).$type
  if (typeof type !== "string") return null

  if (type === BLOCK_HEADER) {
    const b = block as LinearBlock & { plaintext?: string; level?: number }
    const text = typeof b.plaintext === "string" ? b.plaintext : ""
    if (text.length === 0) return null
    const rawLevel =
      typeof b.level === "number" && b.level >= 1 ? Math.floor(b.level) : 1
    const level = Math.max(minHeading, Math.min(6, rawLevel + 1))
    const Tag = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6"
    return (
      <Tag key={key} className="leaflet-doc__heading">
        {renderInline(text, getFacets(block))}
      </Tag>
    )
  }

  if (type === BLOCK_TEXT) {
    const b = block as LinearBlock & { plaintext?: string }
    const text = typeof b.plaintext === "string" ? b.plaintext : ""
    if (text.length === 0) return null
    return (
      <p key={key} className="leaflet-doc__para">
        {renderInline(text, getFacets(block))}
      </p>
    )
  }

  if (type === BLOCK_UL) {
    const items = (block as LinearBlock & { children?: ListItem[] }).children
    const nodes = renderListChildren(items, false)
    if (!nodes) return null
    return (
      <ul key={key} className="leaflet-doc__list">
        {nodes}
      </ul>
    )
  }

  if (type === BLOCK_OL) {
    const b = block as LinearBlock & {
      startIndex?: number
      children?: ListItem[]
    }
    const start =
      typeof b.startIndex === "number" && Number.isFinite(b.startIndex)
        ? Math.floor(b.startIndex)
        : 1
    const nodes = renderListChildren(b.children, true)
    if (!nodes) return null
    return (
      <ol
        key={key}
        className="leaflet-doc__list"
        start={start === 1 ? undefined : start}
      >
        {nodes}
      </ol>
    )
  }

  if (type === BLOCK_IMAGE) {
    return renderImage(block as ImageBlock, key, did)
  }

  if (type === BLOCK_IFRAME) {
    return renderIframe(block as IframeBlock, key)
  }

  return null
}

function renderImage(
  block: ImageBlock,
  key: string,
  did: string | undefined,
): ReactNode {
  const cid = block.image?.ref?.$link
  if (!cid || !did) return null
  const src = `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(cid)}`
  const alt = typeof block.alt === "string" ? block.alt : ""
  const ratio =
    typeof block.aspectRatio?.width === "number" &&
    typeof block.aspectRatio?.height === "number" &&
    block.aspectRatio.width > 0 &&
    block.aspectRatio.height > 0
      ? `${block.aspectRatio.width} / ${block.aspectRatio.height}`
      : undefined
  const className = block.fullBleed
    ? "leaflet-doc__image leaflet-doc__image--full-bleed"
    : "leaflet-doc__image"
  return (
    <figure key={key} className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={ratio ? { aspectRatio: ratio } : undefined}
      />
      {alt ? <figcaption className="leaflet-doc__image-caption">{alt}</figcaption> : null}
    </figure>
  )
}

function renderIframe(block: IframeBlock, key: string): ReactNode {
  const url = typeof block.url === "string" ? block.url : ""
  if (!url || !isAllowedEmbedHost(url)) {
    // Unsupported origin — surface a plain link rather than silently
    // dropping the block. Keeps the content discoverable without
    // executing untrusted embeds.
    if (url) {
      return (
        <p key={key} className="leaflet-doc__embed-fallback">
          <a href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
        </p>
      )
    }
    return null
  }
  const ratio =
    typeof block.aspectRatio?.width === "number" &&
    typeof block.aspectRatio?.height === "number" &&
    block.aspectRatio.width > 0 &&
    block.aspectRatio.height > 0
      ? `${block.aspectRatio.width} / ${block.aspectRatio.height}`
      : "16 / 9"
  const heightStyle =
    typeof block.height === "number" && Number.isFinite(block.height)
      ? { height: `${Math.min(1600, Math.max(16, block.height))}px` }
      : { aspectRatio: ratio }
  return (
    <div key={key} className="leaflet-doc__embed" style={heightStyle}>
      <iframe
        src={url}
        title="Embedded video"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    </div>
  )
}

function getFacets(block: unknown): Facet[] | undefined {
  if (!block || typeof block !== "object") return undefined
  const f = (block as Record<string, unknown>).facets
  return Array.isArray(f) ? (f as Facet[]) : undefined
}

function renderListChildren(
  children: ListItem[] | undefined,
  ordered: boolean,
): ReactNode[] | null {
  if (!Array.isArray(children) || children.length === 0) return null
  const nodes: ReactNode[] = []
  children.forEach((item, i) => {
    if (!item || typeof item !== "object") return
    const text = item.content?.plaintext ?? ""
    const facets = item.content?.facets
    const inline = renderInline(text, facets)
    const nested =
      Array.isArray(item.children) && item.children.length > 0
        ? renderListChildren(item.children, false)
        : item.orderedListChildren?.children &&
            item.orderedListChildren.children.length > 0
          ? renderListChildren(item.orderedListChildren.children, true)
          : null

    nodes.push(
      <li key={`${ordered ? "o" : "u"}-${i}`}>
        <Fragment>{inline}</Fragment>
        {nested ? (
          ordered ? (
            <ol className="leaflet-doc__list">{nested}</ol>
          ) : (
            <ul className="leaflet-doc__list">{nested}</ul>
          )
        ) : null}
      </li>,
    )
  })
  if (nodes.length === 0) return null
  return nodes
}

/**
 * Render a `(text, facets[])` pair as a sequence of inline nodes,
 * wrapping byte-ranges in <strong>/<em>/<a> as appropriate. Byte
 * indexing uses TextEncoder/TextDecoder so emoji round-trip cleanly.
 */
function renderInline(
  text: string,
  facets: Facet[] | undefined,
): ReactNode {
  if (!facets || facets.length === 0) return text

  const encoder = new TextEncoder()
  const decoder = new TextDecoder("utf-8")
  const bytes = encoder.encode(text)

  const boundaries = new Set<number>([0, bytes.byteLength])
  for (const f of facets) {
    if (!f?.index) continue
    if (typeof f.index.byteStart === "number") boundaries.add(f.index.byteStart)
    if (typeof f.index.byteEnd === "number") boundaries.add(f.index.byteEnd)
  }
  const sorted = Array.from(boundaries)
    .filter((b) => b >= 0 && b <= bytes.byteLength)
    .sort((a, b) => a - b)

  const out: ReactNode[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (start === end) continue
    const segment = decoder.decode(bytes.slice(start, end))
    if (segment.length === 0) continue
    out.push(applyFacets(segment, activeFacets(facets, start, end), i))
  }

  return <>{out}</>
}

function activeFacets(
  facets: Facet[],
  byteStart: number,
  byteEnd: number,
): Facet[] {
  const out: Facet[] = []
  for (const f of facets) {
    const fs = f?.index?.byteStart
    const fe = f?.index?.byteEnd
    if (typeof fs !== "number" || typeof fe !== "number") continue
    if (fs <= byteStart && fe >= byteEnd) out.push(f)
  }
  return out
}

function applyFacets(text: string, facets: Facet[], key: number): ReactNode {
  let node: ReactNode = text
  let isBold = false
  let isItalic = false
  let linkUri: string | null = null
  for (const f of facets) {
    for (const feat of f.features ?? []) {
      if (feat.$type === FEATURE_BOLD) isBold = true
      else if (feat.$type === FEATURE_ITALIC) isItalic = true
      else if (feat.$type === FEATURE_LINK) linkUri = feat.uri
    }
  }
  if (isItalic) node = <em>{node}</em>
  if (isBold) node = <strong>{node}</strong>
  if (linkUri) {
    node = (
      <a
        href={linkUri}
        target="_blank"
        rel="noopener noreferrer"
        className="leaflet-doc__link"
      >
        {node}
      </a>
    )
  }
  return <Fragment key={`r-${key}`}>{node}</Fragment>
}

/** True when the renderer would emit non-empty output. Useful for the
 *  caller to hide a wrapper section when there's nothing to render. */
export function isRenderableDescription(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0
  const doc = asLinearDocument(value)
  return !!doc && doc.blocks.length > 0
}
