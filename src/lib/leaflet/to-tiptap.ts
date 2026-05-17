import type {
  Facet,
  FacetFeature,
  HeaderBlock,
  IframeBlock,
  ImageBlock,
  LinearBlock,
  LinearDocument,
  ListItem,
  OrderedListBlock,
  TextBlock,
  UnorderedListBlock,
} from "./types"
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
} from "./types"

/**
 * Hydrate a TipTap / ProseMirror JSON document from a leaflet
 * `linearDocument`. Inverse of `tiptapToLinearDocument` — every
 * facet-bearing range is split into its own text node with the
 * matching marks attached.
 *
 * Returned shape is the `JSONContent` TipTap accepts as initial
 * content. Top-level type is `"doc"` so the editor can hydrate
 * directly via `editor.commands.setContent(...)`.
 */

interface TipTapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  text?: string
  marks?: TipTapMark[]
}

interface TipTapMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface TipTapDoc {
  type: "doc"
  content: TipTapNode[]
}

export function linearDocumentToTipTap(doc: LinearDocument | null): TipTapDoc {
  if (!doc || !Array.isArray(doc.blocks) || doc.blocks.length === 0) {
    return { type: "doc", content: [emptyParagraph()] }
  }

  const content: TipTapNode[] = []
  for (const entry of doc.blocks) {
    if (!entry || typeof entry !== "object") continue
    const node = blockToNode(entry.block)
    if (node) content.push(node)
  }
  if (content.length === 0) content.push(emptyParagraph())
  return { type: "doc", content }
}

function emptyParagraph(): TipTapNode {
  return { type: "paragraph" }
}

function blockToNode(block: LinearBlock | undefined): TipTapNode | null {
  if (!block || typeof block !== "object") return null
  const type = (block as unknown as Record<string, unknown>).$type
  if (type === BLOCK_HEADER) {
    const h = block as HeaderBlock
    const level =
      typeof h.level === "number" && h.level >= 1
        ? Math.min(6, Math.max(1, Math.floor(h.level)))
        : 1
    const inline = textWithFacetsToInline(h.plaintext, h.facets)
    return {
      type: "heading",
      attrs: { level },
      content: inline,
    }
  }
  if (type === BLOCK_TEXT) {
    const p = block as TextBlock
    return {
      type: "paragraph",
      content: textWithFacetsToInline(p.plaintext, p.facets),
    }
  }
  if (type === BLOCK_UL) {
    const ul = block as UnorderedListBlock
    return {
      type: "bulletList",
      content: listItemsToNodes(ul.children),
    }
  }
  if (type === BLOCK_OL) {
    const ol = block as OrderedListBlock
    return {
      type: "orderedList",
      attrs:
        typeof ol.startIndex === "number" && ol.startIndex !== 1
          ? { start: Math.floor(ol.startIndex) }
          : undefined,
      content: listItemsToNodes(ol.children),
    }
  }
  if (type === BLOCK_IMAGE) {
    const img = block as ImageBlock
    const cid = img.image?.ref?.$link
    if (!cid) return null
    return {
      type: "leafletImage",
      attrs: {
        blobCid: cid,
        blobMimeType: img.image?.mimeType ?? "image/jpeg",
        blobSize: typeof img.image?.size === "number" ? img.image.size : 0,
        alt: typeof img.alt === "string" ? img.alt : "",
        width: img.aspectRatio?.width ?? 0,
        height: img.aspectRatio?.height ?? 0,
        fullBleed: img.fullBleed === true,
      },
    }
  }
  if (type === BLOCK_IFRAME) {
    const f = block as IframeBlock
    if (!f.url) return null
    return {
      type: "leafletIframe",
      attrs: {
        url: f.url,
        aspectWidth: f.aspectRatio?.width ?? 16,
        aspectHeight: f.aspectRatio?.height ?? 9,
      },
    }
  }
  return null
}

function listItemsToNodes(items: ListItem[] | undefined): TipTapNode[] {
  if (!Array.isArray(items)) return []
  const out: TipTapNode[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const paragraph: TipTapNode = {
      type: "paragraph",
      content: textWithFacetsToInline(
        item.content?.plaintext ?? "",
        item.content?.facets,
      ),
    }
    const itemContent: TipTapNode[] = [paragraph]
    if (Array.isArray(item.children) && item.children.length > 0) {
      itemContent.push({
        type: "bulletList",
        content: listItemsToNodes(item.children),
      })
    } else if (
      item.orderedListChildren &&
      Array.isArray(item.orderedListChildren.children) &&
      item.orderedListChildren.children.length > 0
    ) {
      itemContent.push({
        type: "orderedList",
        content: listItemsToNodes(item.orderedListChildren.children),
      })
    }
    out.push({ type: "listItem", content: itemContent })
  }
  return out
}

/**
 * Split a `(text, facets[])` pair into a sequence of TipTap text
 * nodes, applying marks to runs that fall inside a facet range. Uses
 * UTF-8 byte offsets to match how facets index into the string.
 */
function textWithFacetsToInline(
  text: string,
  facets: Facet[] | undefined,
): TipTapNode[] {
  if (typeof text !== "string" || text.length === 0) return []
  if (!Array.isArray(facets) || facets.length === 0) {
    return splitOnNewlines(text)
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder("utf-8")
  const bytes = encoder.encode(text)

  // Build a list of boundary points (byte offsets) where the active
  // facet set changes. Then walk segments left-to-right and emit a
  // text node per segment.
  const boundaries = new Set<number>([0, bytes.byteLength])
  for (const f of facets) {
    if (!f?.index) continue
    if (typeof f.index.byteStart === "number") boundaries.add(f.index.byteStart)
    if (typeof f.index.byteEnd === "number") boundaries.add(f.index.byteEnd)
  }
  const sorted = Array.from(boundaries)
    .filter((b) => b >= 0 && b <= bytes.byteLength)
    .sort((a, b) => a - b)

  const nodes: TipTapNode[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (start === end) continue
    const segmentBytes = bytes.slice(start, end)
    const segment = decoder.decode(segmentBytes)
    if (segment.length === 0) continue
    const marks = activeMarksAt(facets, start, end)
    // Newlines inside a block become hardBreaks; everything else is a
    // plain text node (with marks if any are active).
    const parts = segment.split("\n")
    for (let j = 0; j < parts.length; j++) {
      if (parts[j].length > 0) {
        const textNode: TipTapNode = { type: "text", text: parts[j] }
        if (marks.length > 0) textNode.marks = marks
        nodes.push(textNode)
      }
      if (j < parts.length - 1) nodes.push({ type: "hardBreak" })
    }
  }
  return nodes
}

function splitOnNewlines(text: string): TipTapNode[] {
  if (text.indexOf("\n") < 0) return [{ type: "text", text }]
  const nodes: TipTapNode[] = []
  const parts = text.split("\n")
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > 0) nodes.push({ type: "text", text: parts[i] })
    if (i < parts.length - 1) nodes.push({ type: "hardBreak" })
  }
  return nodes
}

function activeMarksAt(
  facets: Facet[],
  byteStart: number,
  byteEnd: number,
): TipTapMark[] {
  const features: FacetFeature[] = []
  for (const f of facets) {
    const fs = f?.index?.byteStart
    const fe = f?.index?.byteEnd
    if (typeof fs !== "number" || typeof fe !== "number") continue
    // Only fully-enclosing ranges count — the boundary set above
    // guarantees that any segment is either entirely inside or
    // entirely outside each facet range.
    if (fs <= byteStart && fe >= byteEnd) {
      for (const feat of f.features ?? []) features.push(feat)
    }
  }
  return features.map(featureToMark).filter((m): m is TipTapMark => m !== null)
}

function featureToMark(f: FacetFeature): TipTapMark | null {
  if (f.$type === FEATURE_BOLD) return { type: "bold" }
  if (f.$type === FEATURE_ITALIC) return { type: "italic" }
  if (f.$type === FEATURE_LINK) return { type: "link", attrs: { href: f.uri } }
  return null
}
