"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"

/**
 * TipTap custom node for `pub.leaflet.blocks.image`. Stores all the
 * blob-ref attributes the lexicon needs (cid, mime, size) plus the
 * image's natural width/height so the renderer can preserve aspect
 * ratio without round-tripping the file. Rendering is delegated to a
 * React node view so the editor surface can show the actual image
 * pulled through our XRPC blob proxy.
 *
 * The owning DID isn't stored on the node — it's supplied by the
 * editor via the `did` storage slot so URLs work across foreign
 * profiles without bloating every node.
 */

export interface LeafletImageStorage {
  /** DID of the repo that owns the blobs referenced by image nodes.
   *  Set by the editor at construction time; read by the node view
   *  when building the getBlob URL. */
  did: string | null
}

export const LeafletImage = Node.create<unknown, LeafletImageStorage>({
  name: "leafletImage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addStorage() {
    return { did: null }
  },

  addAttributes() {
    return {
      blobCid: { default: null },
      blobMimeType: { default: "image/jpeg" },
      blobSize: { default: 0 },
      alt: { default: "" },
      width: { default: 0 },
      height: { default: 0 },
      fullBleed: { default: false },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-leaflet-image]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-leaflet-image": "" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(LeafletImageNodeView)
  },
})

function LeafletImageNodeView({ node, editor, selected }: NodeViewProps) {
  const { blobCid, alt, width, height, fullBleed } = node.attrs as {
    blobCid: string | null
    alt: string
    width: number
    height: number
    fullBleed: boolean
  }
  const did = (
    editor.storage as unknown as Record<string, LeafletImageStorage>
  ).leafletImage?.did

  if (!blobCid || !did) {
    return (
      <NodeViewWrapper
        as="div"
        className="leaflet-doc__image leaflet-doc__image--placeholder"
      >
        <div className="leaflet-doc__image-empty">Image unavailable</div>
      </NodeViewWrapper>
    )
  }

  const src = `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(blobCid)}`
  const aspect =
    width > 0 && height > 0 ? `${width} / ${height}` : undefined
  const className =
    "leaflet-doc__image" +
    (fullBleed ? " leaflet-doc__image--full-bleed" : "") +
    (selected ? " leaflet-doc__image--selected" : "")

  return (
    <NodeViewWrapper as="figure" className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        style={aspect ? { aspectRatio: aspect } : undefined}
        loading="lazy"
        draggable={false}
      />
    </NodeViewWrapper>
  )
}
