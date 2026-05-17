"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { isAllowedEmbedHost } from "@/lib/leaflet/embed-url"

/**
 * TipTap custom node for `pub.leaflet.blocks.iframe`. Used for
 * YouTube / Vimeo embeds. The URL is stored verbatim; the editor
 * relies on the embed-url helper to convert user-pasted watch URLs
 * to embed-form URLs before reaching this node.
 *
 * Inside the editor the iframe still loads — the user wants to see
 * what they pasted. Renderer-side, the same sandbox attributes apply.
 */

export const LeafletIframe = Node.create({
  name: "leafletIframe",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      url: { default: "" },
      aspectWidth: { default: 16 },
      aspectHeight: { default: 9 },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-leaflet-iframe]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-leaflet-iframe": "" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(LeafletIframeNodeView)
  },
})

function LeafletIframeNodeView({ node, selected }: NodeViewProps) {
  const { url, aspectWidth, aspectHeight } = node.attrs as {
    url: string
    aspectWidth: number
    aspectHeight: number
  }
  if (!url || !isAllowedEmbedHost(url)) {
    return (
      <NodeViewWrapper
        as="div"
        className="leaflet-doc__embed leaflet-doc__embed--unsupported"
      >
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
        ) : (
          <span>Embed URL not set</span>
        )}
      </NodeViewWrapper>
    )
  }
  const ratio = `${aspectWidth} / ${aspectHeight}`
  const className =
    "leaflet-doc__embed" + (selected ? " leaflet-doc__embed--selected" : "")
  return (
    <NodeViewWrapper as="div" className={className} style={{ aspectRatio: ratio }}>
      <iframe
        src={url}
        title="Embedded video"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="origin"
      />
    </NodeViewWrapper>
  )
}
