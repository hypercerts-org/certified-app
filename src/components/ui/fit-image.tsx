"use client"

import { useState, type SyntheticEvent } from "react"

export type ImageFit = "cover" | "contain"

/** Wider than this (width / height), a picture is a banner or a wordmark:
 *  cropping it to a frame cuts its words ("ghborhoodForesters."). */
const WIDE_RATIO = 2.2

/**
 * Whether a loaded picture looks like a logo: transparent edges, or edges
 * of one flat colour (a mark on a plain background). Read from a 24px copy
 * on a canvas; a picture from another origin can't be read, and counts as
 * a photo.
 */
function looksLikeLogo(img: HTMLImageElement): boolean {
  try {
    const n = 24
    const canvas = document.createElement("canvas")
    canvas.width = n
    canvas.height = n
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, n, n)
    const data = ctx.getImageData(0, 0, n, n).data
    const edge: [number, number, number, number][] = []
    for (let i = 0; i < n; i++) {
      for (const [x, y] of [
        [i, 0],
        [i, n - 1],
        [0, i],
        [n - 1, i],
      ]) {
        const k = (y * n + x) * 4
        edge.push([data[k], data[k + 1], data[k + 2], data[k + 3]])
      }
    }
    const clear = edge.filter((p) => p[3] < 250).length
    if (clear / edge.length > 0.2) return true
    const mean = [0, 1, 2].map((c) => edge.reduce((s, p) => s + p[c], 0) / edge.length)
    const flat = edge.filter(
      (p) => Math.abs(p[0] - mean[0]) + Math.abs(p[1] - mean[1]) + Math.abs(p[2] - mean[2]) < 36,
    ).length
    return flat / edge.length > 0.85
  } catch {
    // A tainted canvas (another origin) or no canvas at all.
    return false
  }
}

/**
 * How a loaded picture should fill its frame: a photo covers it; a logo,
 * or a banner much wider than about 2:1, is shown whole (on the frame's
 * `--bg-sunken`), so nothing is cut off. Decided from the picture itself
 * once it has loaded (DESIGN.md §4.9).
 */
export function fitFor(img: HTMLImageElement): ImageFit {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return "cover"
  if (w / h > WIDE_RATIO) return "contain"
  return looksLikeLogo(img) ? "contain" : "cover"
}

/**
 * A picture in a fixed frame (a record page's picture, a work card's
 * photo). It covers the frame unless, once loaded, it turns out to be a
 * logo or a wide banner; then it is shown whole. The frame owns the size
 * and the `--bg-sunken` fill; this only fills it. A failed load calls
 * `onError`, so the frame can step aside.
 */
export default function FitImage({
  src,
  alt = "",
  className = "",
  loading = "lazy",
  onError,
  onFit,
}: {
  src: string
  alt?: string
  className?: string
  loading?: "lazy" | "eager"
  onError?: () => void
  /** Once loaded: how it fills the frame, and its own width / height (a
   *  frame may shrink to a wide banner instead of leaving bands). */
  onFit?: (fit: ImageFit, ratio: number) => void
}) {
  const [fit, setFit] = useState<{ src: string; fit: ImageFit } | null>(null)
  const current = fit?.src === src ? fit.fit : "cover"
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth <= 1) {
      onError?.()
      return
    }
    const next = fitFor(img)
    setFit({ src, fit: next })
    onFit?.(next, img.naturalWidth / img.naturalHeight)
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      data-fit={current}
      className={`fit-image ${className}`.trim()}
      onLoad={onLoad}
      onError={onError}
    />
  )
}
