import type {
  Facet,
  FacetFeature,
  LinearBlock,
  LinearBlockEntry,
  LinearDocument,
  ListItem,
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
  LINEAR_DOC_TYPE,
} from "./types"
import { safeHttpUrl } from "@/lib/utils/safe-url"

/**
 * Convert a TipTap / ProseMirror JSON document into a
 * `pub.leaflet.pages.linearDocument` record value.
 *
 * Only top-level blocks recognised by the leaflet renderer are emitted:
 * heading, paragraph, bulletList, orderedList. Any other top-level
 * node is silently skipped (matches the renderer's drop-on-unknown
 * behaviour, so an editor-side and reader-side gap stays symmetric).
 *
 * Inline marks (`bold`, `italic`, `link`) are converted to atproto
 * facets — byte-indexed ranges into the block's flattened text. The
 * byte indexing uses UTF-8 (TextEncoder.encode), NOT JavaScript
 * string offsets — emoji and other multi-byte glyphs would otherwise
 * desync the index against the stored text.
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

export function tiptapToLinearDocument(doc: TipTapNode): LinearDocument {
  const blocks: LinearBlockEntry[] = []
  const children = doc.content ?? []
  for (const node of children) {
    const block = nodeToBlock(node)
    if (block) blocks.push({ block })
  }
  return { $type: LINEAR_DOC_TYPE, blocks }
}

function nodeToBlock(node: TipTapNode): LinearBlock | null {
  if (node.type === "heading") {
    const level =
      typeof node.attrs?.level === "number" && node.attrs.level >= 1
        ? Math.floor(node.attrs.level as number)
        : 1
    const { text, facets } = flattenInline(node.content ?? [])
    if (text.length === 0) return null
    return {
      $type: BLOCK_HEADER,
      plaintext: text,
      level,
      ...(facets.length ? { facets } : {}),
    }
  }

  if (node.type === "paragraph") {
    const { text, facets } = flattenInline(node.content ?? [])
    if (text.length === 0) return null
    return {
      $type: BLOCK_TEXT,
      plaintext: text,
      ...(facets.length ? { facets } : {}),
    }
  }

  if (node.type === "bulletList") {
    const items = listItemsFromContent(node.content ?? [])
    if (items.length === 0) return null
    return { $type: BLOCK_UL, children: items }
  }

  if (node.type === "orderedList") {
    const items = listItemsFromContent(node.content ?? [])
    if (items.length === 0) return null
    const start =
      typeof node.attrs?.start === "number" && node.attrs.start >= 1
        ? Math.floor(node.attrs.start as number)
        : undefined
    return {
      $type: BLOCK_OL,
      ...(start !== undefined && start !== 1 ? { startIndex: start } : {}),
      children: items,
    }
  }

  if (node.type === "leafletImage") {
    const a = node.attrs ?? {}
    const cid = typeof a.blobCid === "string" ? a.blobCid : null
    const mimeType =
      typeof a.blobMimeType === "string" ? a.blobMimeType : "image/jpeg"
    const size = typeof a.blobSize === "number" ? a.blobSize : 0
    const width = typeof a.width === "number" ? Math.floor(a.width as number) : 0
    const height = typeof a.height === "number" ? Math.floor(a.height as number) : 0
    if (!cid || width <= 0 || height <= 0) return null
    return {
      $type: BLOCK_IMAGE,
      image: {
        $type: "blob",
        ref: { $link: cid },
        mimeType,
        size,
      },
      aspectRatio: { width, height },
      ...(typeof a.alt === "string" && a.alt.trim().length > 0
        ? { alt: a.alt.trim() }
        : {}),
      ...(a.fullBleed === true ? { fullBleed: true } : {}),
    }
  }

  if (node.type === "leafletIframe") {
    const a = node.attrs ?? {}
    const url = typeof a.url === "string" ? a.url.trim() : ""
    if (!url) return null
    const aspectWidth =
      typeof a.aspectWidth === "number" && a.aspectWidth > 0
        ? Math.floor(a.aspectWidth as number)
        : null
    const aspectHeight =
      typeof a.aspectHeight === "number" && a.aspectHeight > 0
        ? Math.floor(a.aspectHeight as number)
        : null
    return {
      $type: BLOCK_IFRAME,
      url,
      ...(aspectWidth && aspectHeight
        ? { aspectRatio: { width: aspectWidth, height: aspectHeight } }
        : {}),
    }
  }

  return null
}

function listItemsFromContent(content: TipTapNode[]): ListItem[] {
  const out: ListItem[] = []
  for (const node of content) {
    if (node.type !== "listItem") continue
    const inner = node.content ?? []
    // A listItem typically contains a paragraph as its first child,
    // then optionally a nested list. We flatten the first paragraph's
    // text into `content`, and recurse into any nested list. The
    // ListItem schema uses two distinct fields: `children` for a
    // nested *bullet* list, `orderedListChildren.children` for a
    // nested *ordered* list. Without the type-driven split, a nested
    // ordered list round-trips as a nested bullet list — silent
    // data-loss the user only sees on the next edit.
    let contentValue: ListItem["content"] | undefined
    let nestedBullet: ListItem[] | undefined
    let nestedOrdered: ListItem[] | undefined
    for (const child of inner) {
      if (child.type === "paragraph" && !contentValue) {
        const { text, facets } = flattenInline(child.content ?? [])
        contentValue = {
          plaintext: text,
          ...(facets.length ? { facets } : {}),
        }
      } else if (child.type === "bulletList") {
        const nested = listItemsFromContent(child.content ?? [])
        if (nested.length > 0) nestedBullet = nested
      } else if (child.type === "orderedList") {
        const nested = listItemsFromContent(child.content ?? [])
        if (nested.length > 0) nestedOrdered = nested
      }
    }
    if (!contentValue && !nestedBullet && !nestedOrdered) continue
    out.push({
      ...(contentValue ? { content: contentValue } : {}),
      ...(nestedBullet ? { children: nestedBullet } : {}),
      ...(nestedOrdered
        ? { orderedListChildren: { children: nestedOrdered } }
        : {}),
    })
  }
  return out
}

/**
 * Flatten an inline-node array (text + hardBreak + marks) into a single
 * `text` string plus a facet list. Byte-indexed.
 */
function flattenInline(nodes: TipTapNode[]): {
  text: string
  facets: Facet[]
} {
  let text = ""
  const encoder = new TextEncoder()
  const facets: Facet[] = []

  for (const node of nodes) {
    if (node.type === "hardBreak") {
      text += "\n"
      continue
    }
    if (node.type !== "text" || typeof node.text !== "string") continue

    const runStartBytes = encoder.encode(text).byteLength
    const segment = node.text
    text += segment
    const runEndBytes = runStartBytes + encoder.encode(segment).byteLength

    if (!node.marks || node.marks.length === 0) continue

    const features = marksToFeatures(node.marks)
    if (features.length === 0) continue
    facets.push({
      index: { byteStart: runStartBytes, byteEnd: runEndBytes },
      features,
    })
  }

  return { text, facets: mergeAdjacentFacets(facets) }
}

function marksToFeatures(marks: TipTapMark[]): FacetFeature[] {
  const features: FacetFeature[] = []
  for (const m of marks) {
    if (m.type === "bold") features.push({ $type: FEATURE_BOLD })
    else if (m.type === "italic") features.push({ $type: FEATURE_ITALIC })
    else if (m.type === "link") {
      const href =
        typeof m.attrs?.href === "string" ? (m.attrs.href as string) : ""
      // Defense in depth on the write boundary: a `javascript:` URI
      // could enter the editor's JSON via a `setContent()` call from
      // a foreign record (`to-tiptap` hydrates marks symmetrically).
      // Without this guard a benign-looking edit-and-save would
      // re-publish the malicious URI under the user's identity.
      const safe = safeHttpUrl(href)
      if (safe) features.push({ $type: FEATURE_LINK, uri: safe })
    }
  }
  return features
}

/**
 * If two adjacent facets share an identical feature set, merge them
 * into one range. Without this the output gets noisy when the user
 * types contiguous bold/italic text — TipTap splits text nodes on
 * every position change, but the wire format is happier with fewer
 * ranges.
 */
function mergeAdjacentFacets(facets: Facet[]): Facet[] {
  if (facets.length < 2) return facets
  const out: Facet[] = [facets[0]]
  for (let i = 1; i < facets.length; i++) {
    const prev = out[out.length - 1]
    const cur = facets[i]
    if (
      prev.index.byteEnd === cur.index.byteStart &&
      featuresEqual(prev.features, cur.features)
    ) {
      prev.index.byteEnd = cur.index.byteEnd
    } else {
      out.push(cur)
    }
  }
  return out
}

function featuresEqual(a: FacetFeature[], b: FacetFeature[]): boolean {
  if (a.length !== b.length) return false
  const aKeys = a.map(featureKey).sort()
  const bKeys = b.map(featureKey).sort()
  return aKeys.every((k, i) => k === bKeys[i])
}

function featureKey(f: FacetFeature): string {
  if (f.$type === FEATURE_LINK) return `${f.$type}:${f.uri}`
  return f.$type
}
