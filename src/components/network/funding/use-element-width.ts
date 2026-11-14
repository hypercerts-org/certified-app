"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"

/** The width of an element, kept current with a ResizeObserver. */
export function useElementWidth<T extends HTMLElement>(): [
  (node: T | null) => void,
  number,
] {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    if (!node) return
    setWidth(node.clientWidth)
    observer.current = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      setWidth((prev) => (prev === w ? prev : w))
    })
    observer.current.observe(node)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  return [ref, width]
}

export interface CanvasColors {
  fg: string
  muted: string
  ok: string
  /** The page background, for halos behind text drawn over marks. */
  bg: string
  /** Changes whenever the colours are re-read; empty until the first read. */
  key: string
}

const TOKENS = { fg: "--fg-primary", muted: "--fg-muted", ok: "--badge-success-fg", bg: "--bg-canvas" } as const

/**
 * Token colours resolved for canvas drawing (a canvas can't read CSS
 * variables), re-read when the theme or the look changes. Each token goes
 * through a probe element, so whatever colour syntax a token uses comes back
 * as a computed colour the canvas understands. Transparency is applied with
 * `globalAlpha` at draw time, never by editing the colour.
 */
export function useCanvasColors(): CanvasColors {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState<CanvasColors>({ fg: "", muted: "", ok: "", bg: "", key: "" })
  useEffect(() => {
    const read = () => {
      const probe = document.createElement("span")
      probe.style.display = "none"
      document.body.appendChild(probe)
      const resolve = (token: string) => {
        probe.style.color = `var(${token})`
        return getComputedStyle(probe).color
      }
      const next = {
        fg: resolve(TOKENS.fg),
        muted: resolve(TOKENS.muted),
        ok: resolve(TOKENS.ok),
        bg: resolve(TOKENS.bg),
      }
      probe.remove()
      setColors((prev) =>
        prev.fg === next.fg && prev.muted === next.muted && prev.ok === next.ok && prev.bg === next.bg
          ? prev
          : { ...next, key: `${next.fg}|${next.muted}|${next.ok}|${next.bg}` },
      )
    }
    // After the theme class lands on <html>.
    const id = requestAnimationFrame(read)
    // Looks swap tokens through attributes on <html>.
    const mo = new MutationObserver(() => requestAnimationFrame(read))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-look", "style"] })
    return () => {
      cancelAnimationFrame(id)
      mo.disconnect()
    }
  }, [resolvedTheme])
  return colors
}

/** Size a canvas for the device pixel ratio and return its cleared 2D context. */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  return ctx
}
