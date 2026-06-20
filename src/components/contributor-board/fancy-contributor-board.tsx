"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { getInitials } from "@/lib/utils/initials"
import { layoutTreemap, tileSizing, type TreemapTile } from "@/lib/contributor-board/treemap"
import type { BoardConfig, BoardEntry } from "@/lib/atproto/hyperboard-types"

interface FancyContributorBoardProps {
  entries: BoardEntry[]
  config: BoardConfig
  /** repo that owns the board (reserved for future blob backgrounds) */
  boardDid: string | null
  emptyMessage?: string
}

const ASPECT: Record<string, string> = {
  "16:9": "16 / 9",
  "4:3": "4 / 3",
  "1:1": "1 / 1",
}

/** Only http(s) links are followed — a board owner could type a javascript: URL. */
function safeHttpUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}

/** Track an element's content-box size with a ResizeObserver. */
function useElementSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) setSize({ width: box.width, height: box.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ...size }
}

interface FancyTileProps {
  tile: TreemapTile
  /** share of total weight, 0–100 */
  percent: number
  /** staggered entrance delay (ms) */
  delay: number
}

function FancyTile({ tile, percent, delay }: FancyTileProps) {
  const { x, y, width, height, entry } = tile
  const { avatarSize, fontSize, showAvatar, showLabel } = tileSizing(width, height)
  const [imgError, setImgError] = useState(false)

  const shapeClass = entry.circular
    ? "fancy-tile__media--circle"
    : "fancy-tile__media--square"

  const content = (
    <>
      {/* Decorative layers paint behind the content span (earlier in DOM,
          both positioned, so content wins paint order without a z-index). */}
      <span className="fancy-tile__sheen" aria-hidden="true" />
      <span className="fancy-tile__glow" aria-hidden="true" />

      <span className="fancy-tile__content">
        {showAvatar ? (
          <span
            className={`fancy-tile__media ${shapeClass}`}
            style={{ width: avatarSize, height: avatarSize }}
          >
            {entry.imageUrl && !imgError ? (
              <Image
                src={entry.imageUrl}
                alt={entry.name}
                width={avatarSize}
                height={avatarSize}
                className="fancy-tile__img"
                onError={() => setImgError(true)}
                unoptimized
              />
            ) : (
              <span className="fancy-tile__initials" aria-hidden="true">
                {getInitials(entry.name, entry.did)}
              </span>
            )}
          </span>
        ) : null}

        {showLabel ? (
          <span className="fancy-tile__name" style={{ fontSize }}>
            {entry.name}
          </span>
        ) : null}

        {showLabel && percent >= 1 ? (
          <span className="fancy-tile__weight">{Math.round(percent)}%</span>
        ) : null}
      </span>
    </>
  )

  const style = {
    left: x,
    top: y,
    width,
    height,
    animationDelay: `${delay}ms`,
  } as const

  const linkUrl = safeHttpUrl(entry.url)
  if (linkUrl) {
    return (
      <a
        className="fancy-tile fancy-tile--link"
        style={style}
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
    <div className="fancy-tile" style={style}>
      {content}
    </div>
  )
}

/**
 * A deluxe rendering of the contributor board: same weighted treemap geometry
 * as {@link ContributorBoard}, skinned with an ambient gradient stage, glassy
 * gradient tiles with depth, a gold hover highlight, weight badges, and a
 * staggered entrance. Read-only showcase — editing lives on the standard
 * Contributor Board tab.
 */
export function FancyContributorBoard({
  entries,
  config,
  emptyMessage = "No contributors on this board yet.",
}: FancyContributorBoardProps) {
  const { ref, width, height } = useElementSize()

  const tiles = useMemo(
    () => layoutTreemap(entries, width, height),
    [entries, width, height],
  )

  // Each tile's share of the total contribution weight, for the hover badge.
  const percentByKey = useMemo(() => {
    const total = entries.reduce((sum, e) => sum + Math.max(0, e.value), 0)
    const map = new Map<string, number>()
    for (const e of entries) {
      map.set(e.key, total > 0 ? (Math.max(0, e.value) / total) * 100 : 0)
    }
    return map
  }, [entries])

  const aspectRatio = ASPECT[config.aspectRatio ?? "16:9"] ?? "16 / 9"

  return (
    <div className="fancy-board">
      <div ref={ref} className="fancy-board__stage" style={{ aspectRatio }}>
        {/* Ambient drifting light, behind the tiles. */}
        <span className="fancy-board__ambient" aria-hidden="true" />
        <span className="fancy-board__grid" aria-hidden="true" />

        <div className="fancy-board__canvas">
          {tiles.map((tile, i) => (
            <FancyTile
              key={tile.entry.key}
              tile={tile}
              percent={percentByKey.get(tile.entry.key) ?? 0}
              delay={Math.min(i * 45, 600)}
            />
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="fancy-board__empty">{emptyMessage}</div>
        ) : null}
      </div>
    </div>
  )
}

export default FancyContributorBoard
