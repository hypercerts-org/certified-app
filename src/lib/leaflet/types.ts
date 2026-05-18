/**
 * Shared types for `pub.leaflet.pages.linearDocument` records. These
 * describe the on-wire shape — both the renderer and the TipTap
 * editor convert in/out of these shapes via the helpers in this
 * module.
 *
 * Facets follow the standard atproto convention: byte-indexed ranges
 * into the block's `text` field, each carrying one or more `features`
 * keyed by `$type`. Same model as Bluesky post facets (`app.bsky.richtext.facet`)
 * — UTF-8 byte offsets, NOT JavaScript string offsets.
 */

export const LINEAR_DOC_TYPE = "pub.leaflet.pages.linearDocument" as const
export const BLOCK_HEADER = "pub.leaflet.blocks.header" as const
export const BLOCK_TEXT = "pub.leaflet.blocks.text" as const
export const BLOCK_UL = "pub.leaflet.blocks.unorderedList" as const
export const BLOCK_OL = "pub.leaflet.blocks.orderedList" as const
export const BLOCK_IMAGE = "pub.leaflet.blocks.image" as const
export const BLOCK_IFRAME = "pub.leaflet.blocks.iframe" as const

export const FEATURE_BOLD = "pub.leaflet.richtext.facet#bold" as const
export const FEATURE_ITALIC = "pub.leaflet.richtext.facet#italic" as const
export const FEATURE_LINK = "pub.leaflet.richtext.facet#link" as const

/** Lexicon blob shape — the wire format for `pub.leaflet.blocks.image.image`. */
export interface BlobRef {
  $type: "blob"
  ref: { $link: string }
  mimeType: string
  size: number
}

export interface AspectRatio {
  width: number
  height: number
}

/** A byte-indexed facet range carrying one or more inline features. */
export interface Facet {
  index: { byteStart: number; byteEnd: number }
  features: FacetFeature[]
}

export type FacetFeature =
  | { $type: typeof FEATURE_BOLD }
  | { $type: typeof FEATURE_ITALIC }
  | { $type: typeof FEATURE_LINK; uri: string }

/** A header block. `level` is 1-6 (lexicon allows 1, leaflet UI emits 1-3 typically). */
export interface HeaderBlock {
  $type: typeof BLOCK_HEADER
  plaintext: string
  level?: number
  facets?: Facet[]
}

/** A standard paragraph block. */
export interface TextBlock {
  $type: typeof BLOCK_TEXT
  plaintext: string
  facets?: Facet[]
}

/** Unordered / ordered list children — both lexicons use the same shape. */
export interface ListItem {
  content?: { plaintext: string; facets?: Facet[] }
  /** Nested children — same shape as the parent block's children. */
  children?: ListItem[]
  orderedListChildren?: { children?: ListItem[] }
}

export interface UnorderedListBlock {
  $type: typeof BLOCK_UL
  children: ListItem[]
}

export interface OrderedListBlock {
  $type: typeof BLOCK_OL
  startIndex?: number
  children: ListItem[]
}

/** `pub.leaflet.blocks.image` — inline image carried as a blob ref
 *  on the same repo as the parent record. */
export interface ImageBlock {
  $type: typeof BLOCK_IMAGE
  image: BlobRef
  aspectRatio: AspectRatio
  alt?: string
  fullBleed?: boolean
}

/** `pub.leaflet.blocks.iframe` — embedded URL (YouTube, Vimeo, etc.).
 *  Lexicon caps `height` to 1600 and lets `aspectRatio` carry the
 *  intended box ratio for responsive layouts. */
export interface IframeBlock {
  $type: typeof BLOCK_IFRAME
  url: string
  height?: number
  aspectRatio?: AspectRatio
}

export type LinearBlock =
  | HeaderBlock
  | TextBlock
  | UnorderedListBlock
  | OrderedListBlock
  | ImageBlock
  | IframeBlock

/** Wrapper for a single entry inside `linearDocument.blocks`. */
export interface LinearBlockEntry {
  block: LinearBlock
  alignment?: string
}

/** The top-level `pub.leaflet.pages.linearDocument` record value. */
export interface LinearDocument {
  $type?: typeof LINEAR_DOC_TYPE
  blocks: LinearBlockEntry[]
}

/** strongRef shape — the third member of the longDescription union. */
export interface StrongRef {
  uri: string
  cid: string
}

/** The three accepted on-wire shapes for `longDescription`. */
export type LongDescriptionValue = string | LinearDocument | StrongRef
