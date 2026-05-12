"use client"

import React from "react"
import type { BskyFacet, BskyFacetFeature } from "@/hooks/use-bsky-posts"
import { safeHttpUrl } from "@/lib/utils/safe-url"

interface RichTextProps {
  text: string
  facets?: BskyFacet[]
}

/**
 * Render a Bluesky post body with its rich-text facets — links,
 * mentions, and hashtags become inline anchors. Plain text stays as
 * text.
 *
 * Why the TextEncoder/TextDecoder dance: AT Protocol facets index the
 * post by UTF-8 byte offsets, not by JS character (UTF-16 code unit)
 * offsets. A naïve `text.slice(byteStart, byteEnd)` corrupts any post
 * that contains multi-byte characters (emoji, accented letters, CJK).
 * Encoding once and slicing the byte array gets the spans right.
 */
export default function RichText({ text, facets }: RichTextProps) {
  if (!facets || facets.length === 0) return <>{text}</>

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const bytes = encoder.encode(text)

  // Sort by start; skip malformed/out-of-bounds spans defensively.
  const sorted = [...facets]
    .filter(
      (f) =>
        f.index.byteStart >= 0 &&
        f.index.byteEnd <= bytes.length &&
        f.index.byteStart < f.index.byteEnd,
    )
    .sort((a, b) => a.index.byteStart - b.index.byteStart)

  const parts: React.ReactNode[] = []
  let cursor = 0

  for (let i = 0; i < sorted.length; i++) {
    const facet = sorted[i]
    // Drop facets that overlap a previously-emitted span. Bluesky
    // doesn't produce these but a malformed PDS could.
    if (facet.index.byteStart < cursor) continue

    if (facet.index.byteStart > cursor) {
      parts.push(decoder.decode(bytes.slice(cursor, facet.index.byteStart)))
    }

    const segment = decoder.decode(
      bytes.slice(facet.index.byteStart, facet.index.byteEnd),
    )
    parts.push(renderFeature(facet.features[0], segment, i))
    cursor = facet.index.byteEnd
  }

  if (cursor < bytes.length) {
    parts.push(decoder.decode(bytes.slice(cursor)))
  }

  return <>{parts}</>
}

function renderFeature(
  feature: BskyFacetFeature | undefined,
  segment: string,
  key: number,
): React.ReactNode {
  if (!feature) return segment

  // Stop the click from bubbling to any parent click handler so
  // tapping a link doesn't trigger an enclosing card action.
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  if (feature.$type === "app.bsky.richtext.facet#link") {
    // `safeHttpUrl` rejects javascript:, data:, and other non-http(s)
    // schemes — defense against a malicious facet pointing at an XSS
    // sink. Falls back to plain text if the URL doesn't validate.
    const href = safeHttpUrl(feature.uri)
    if (!href) return segment
    return (
      <a
        key={key}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        className="news__rich-link"
      >
        {segment}
      </a>
    )
  }

  if (feature.$type === "app.bsky.richtext.facet#mention") {
    return (
      <a
        key={key}
        href={`https://bsky.app/profile/${encodeURIComponent(feature.did)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        className="news__rich-link"
      >
        {segment}
      </a>
    )
  }

  if (feature.$type === "app.bsky.richtext.facet#tag") {
    return (
      <a
        key={key}
        href={`https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        className="news__rich-link"
      >
        {segment}
      </a>
    )
  }

  return segment
}
