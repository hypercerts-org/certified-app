"use client"

import { useState } from "react"
import Image from "next/image"
import { Play } from "lucide-react"
import { getInitials } from "@/lib/utils/initials"
import { tileSizing, type TreemapTile } from "@/lib/contributor-board/treemap"
import type { BoardEntry } from "@/lib/atproto/hyperboard-types"

/** Only http(s) links are followed — a board owner could type a javascript: URL. */
function safeHttpUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}

interface ContributorTileProps {
  tile: TreemapTile
  /** render contributor images in grayscale (board config) */
  grayscale?: boolean
  /** edit mode disables the view-mode link/video click behaviour */
  editing?: boolean
  /** per-board tile border colour (user value); falls back to the token */
  borderColor?: string
  /** open the shared video lightbox for this entry */
  onOpenVideo?: (entry: BoardEntry) => void
}

/**
 * One contributor tile, absolutely positioned by the treemap layout. Geometry
 * (left/top/width/height, avatar px, font px) is inline; every colour/radius/
 * shadow comes from a token via the .contributor-tile CSS. Hover overlays are
 * CSS-driven (no JS state).
 */
export function ContributorTile({
  tile,
  grayscale = false,
  editing = false,
  borderColor,
  onOpenVideo,
}: ContributorTileProps) {
  const { x, y, width, height, entry } = tile
  const { avatarSize, fontSize, showAvatar, showLabel } = tileSizing(width, height)

  // Fall back to initials when a user-supplied image URL fails to load.
  // Tracking the errored URL (rather than a boolean reset via effect) means a
  // new imageUrl auto-clears the error without a set-state-in-effect cascade.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  const imgError = erroredSrc !== null && erroredSrc === entry.imageUrl

  const shapeClass = entry.circular
    ? "contributor-tile__avatar--circle"
    : "contributor-tile__avatar--square"

  const content = (
    <>
      {showAvatar ? (
        <span
          className={`contributor-tile__avatar ${shapeClass}`}
          style={{ width: avatarSize, height: avatarSize }}
        >
          {entry.imageUrl && !imgError ? (
            <Image
              src={entry.imageUrl}
              alt={entry.name}
              width={avatarSize}
              height={avatarSize}
              className={`contributor-tile__img${grayscale ? " contributor-tile__img--grayscale" : ""}`}
              onError={() => setErroredSrc(entry.imageUrl)}
              unoptimized
            />
          ) : (
            <span
              className="contributor-tile__initials"
              style={{ width: avatarSize, height: avatarSize }}
              aria-hidden="true"
            >
              {getInitials(entry.name, entry.did)}
            </span>
          )}
        </span>
      ) : null}

      {showLabel ? (
        <span className="contributor-tile__name" style={{ fontSize }}>
          {entry.name}
        </span>
      ) : null}

      {/* Hover overlay: image or iframe, CSS-shown on tile hover. */}
      {entry.hoverImageUrl ? (
        <span className="contributor-tile__hover" aria-hidden="true">
          <Image
            src={entry.hoverImageUrl}
            alt=""
            fill
            className="contributor-tile__hover-img"
            unoptimized
          />
        </span>
      ) : entry.hoverIframeUrl ? (
        <span className="contributor-tile__hover" aria-hidden="true">
          <iframe
            src={entry.hoverIframeUrl}
            title=""
            className="contributor-tile__hover-iframe"
            tabIndex={-1}
          />
        </span>
      ) : null}

      {entry.videoUrl ? (
        <span className="contributor-tile__play" aria-hidden="true">
          <Play size={Math.max(12, Math.min(20, avatarSize * 0.3))} />
        </span>
      ) : null}
    </>
  )

  const geometry = { left: x, top: y, width, height, borderColor }

  // View mode: a video tile opens the lightbox; a link tile is an anchor;
  // otherwise a plain div. Edit mode is always a plain div (the editable
  // board overlays its own controls).
  if (!editing && entry.videoUrl) {
    return (
      <button
        type="button"
        className="contributor-tile contributor-tile--button"
        style={geometry}
        onClick={() => onOpenVideo?.(entry)}
        aria-label={`Play ${entry.name} video`}
      >
        {content}
      </button>
    )
  }

  const linkUrl = safeHttpUrl(entry.url)
  if (!editing && linkUrl) {
    return (
      <a
        className="contributor-tile contributor-tile--link"
        style={geometry}
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={entry.name}
      >
        {content}
      </a>
    )
  }

  return (
    <div className="contributor-tile" style={geometry}>
      {content}
    </div>
  )
}
