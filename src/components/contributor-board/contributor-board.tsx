"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ReactNode,
} from "react"
import Image from "next/image"
import AppDialog from "@/components/ui/app-dialog"
import { layoutTreemap, type TreemapTile } from "@/lib/contributor-board/treemap"
import { boardImageUrl } from "@/lib/atproto/hyperboard"
import type { BoardConfig, BoardEntry } from "@/lib/atproto/hyperboard-types"
import { ContributorTile } from "./contributor-tile"

interface ContributorBoardProps {
  entries: BoardEntry[]
  config: BoardConfig
  /** repo that owns the board (for resolving a blob background image) */
  boardDid: string | null
  editing?: boolean
  /** per-tile overlay (e.g. edit/resize handles) rendered above each tile */
  renderTileOverlay?: (tile: TreemapTile) => ReactNode
  /** content layered over the whole board (e.g. an "add contributor" button) */
  children?: ReactNode
  emptyMessage?: string
}

const ASPECT: Record<string, string> = {
  "16:9": "16 / 9",
  "4:3": "4 / 3",
  "1:1": "1 / 1",
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

function BackgroundLayer({
  config,
  boardDid,
}: {
  config: BoardConfig
  boardDid: string | null
}) {
  const grayscale = config.backgroundGrayscale !== false
  // Opacity may arrive as a 0–1 fraction or a 0–100 percent, number or string
  // (hyperboards-v2 stores e.g. "0.55"). Normalise to a 0–1 fraction.
  const rawOpacity =
    typeof config.backgroundOpacity === "number"
      ? config.backgroundOpacity
      : typeof config.backgroundOpacity === "string"
        ? parseFloat(config.backgroundOpacity)
        : NaN
  const opacity = Number.isFinite(rawOpacity)
    ? Math.max(0, Math.min(1, rawOpacity > 1 ? rawOpacity / 100 : rawOpacity))
    : 0.15
  const layerStyle = {
    opacity,
    filter: grayscale ? "grayscale(1)" : undefined,
  } as const

  if (config.backgroundType === "iframe" && config.backgroundIframeUrl) {
    return (
      <div className="contributor-board__bg" style={layerStyle} aria-hidden="true">
        <iframe
          src={config.backgroundIframeUrl}
          title=""
          className="contributor-board__bg-iframe"
          tabIndex={-1}
        />
      </div>
    )
  }

  const imageUrl = boardImageUrl(config.backgroundImage, boardDid)
  if (imageUrl) {
    return (
      <div className="contributor-board__bg" style={layerStyle} aria-hidden="true">
        <Image
          src={imageUrl}
          alt=""
          fill
          className="contributor-board__bg-img"
          unoptimized
        />
      </div>
    )
  }
  return null
}

interface VideoEmbed {
  kind: "video" | "iframe"
  src: string
}

/** Map a contributor video URL to a playable embed. */
function resolveVideoEmbed(url: string): VideoEmbed {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/.exec(url)
  if (yt) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` }
  const vimeo = /vimeo\.com\/(\d+)/.exec(url)
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` }
  const ig = /instagram\.com\/(reel|p)\/([\w-]+)/.exec(url)
  if (ig) return { kind: "iframe", src: `https://www.instagram.com/${ig[1]}/${ig[2]}/embed/` }
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) return { kind: "video", src: url }
  return { kind: "iframe", src: url }
}

function VideoLightbox({
  entry,
  onClose,
}: {
  entry: BoardEntry
  onClose: () => void
}) {
  const embed = entry.videoUrl ? resolveVideoEmbed(entry.videoUrl) : null
  return (
    <AppDialog
      ariaLabel={`${entry.name} video`}
      onClose={onClose}
      className="contributor-board__lightbox"
      maxWidth={880}
    >
      <div className="contributor-board__lightbox-body">
        {embed?.kind === "video" ? (
          <video src={embed.src} className="contributor-board__video" controls autoPlay />
        ) : embed ? (
          <iframe
            src={embed.src}
            title={`${entry.name} video`}
            className="contributor-board__video"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : null}
      </div>
    </AppDialog>
  )
}

/**
 * The Contributor Board: a weighted treemap of contributor tiles (sized by
 * contribution weight) with board cosmetics (background, aspect ratio,
 * grayscale, image shape). Read-only by default; `editing` + `renderTileOverlay`
 * let the editable wrapper layer in resize/edit handles.
 */
export function ContributorBoard({
  entries,
  config,
  boardDid,
  editing = false,
  renderTileOverlay,
  children,
  emptyMessage = "No contributors on this board yet.",
}: ContributorBoardProps) {
  const { ref, width, height } = useElementSize()
  const [videoEntry, setVideoEntry] = useState<BoardEntry | null>(null)

  // Memoised so a resize drag (which mutates entries per pointermove) doesn't
  // re-run the full d3 hierarchy + squarify pass on every unrelated render.
  const tiles = useMemo(
    () => layoutTreemap(entries, width, height),
    [entries, width, height],
  )
  const aspectRatio = ASPECT[config.aspectRatio ?? "16:9"] ?? "16 / 9"
  const borderColor = config.borderColor || undefined
  const backgroundColor = config.backgroundColor || undefined

  return (
    <div className="contributor-board">
      <div
        ref={ref}
        className="contributor-board__frame"
        style={{ aspectRatio, backgroundColor }}
      >
        <BackgroundLayer config={config} boardDid={boardDid} />

        <div className="contributor-board__canvas" style={{ borderColor }}>
          {tiles.map((tile) => (
            <Fragment key={tile.entry.key}>
              <ContributorTile
                tile={tile}
                grayscale={config.grayscaleImages === true}
                editing={editing}
                borderColor={borderColor}
                onOpenVideo={setVideoEntry}
              />
              {renderTileOverlay?.(tile)}
            </Fragment>
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="contributor-board__empty">{emptyMessage}</div>
        ) : null}

        {children}
      </div>

      {videoEntry ? (
        <VideoLightbox entry={videoEntry} onClose={() => setVideoEntry(null)} />
      ) : null}
    </div>
  )
}

export default ContributorBoard
