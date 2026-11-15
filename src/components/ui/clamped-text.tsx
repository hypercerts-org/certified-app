"use client"

import React, { useEffect, useId, useRef, useState } from "react"

/**
 * Long text shown in place, cut to a few lines with a fade and a "Read
 * more" under it (left-aligned, like the text). Works for rich content
 * (paragraphs, lists), since it clips by height rather than by line
 * count. The toggle appears only when the text is longer than the cut.
 */
export default function ClampedText({
  lines = 8,
  children,
  className = "",
  moreLabel = "Read more",
  lessLabel = "Show less",
}: {
  /** How many lines (at the text's own line height) to show. */
  lines?: number
  children: React.ReactNode
  className?: string
  moreLabel?: string
  lessLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 2)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const cut = !open
  return (
    <div className={className}>
      <div
        ref={ref}
        id={id}
        className="overflow-hidden"
        style={
          cut
            ? {
                maxHeight: `calc(${lines} * 1lh)`,
                ...(overflows
                  ? {
                      WebkitMaskImage:
                        "linear-gradient(to bottom, var(--mask-opaque) calc(100% - 3lh), transparent)",
                      maskImage: "linear-gradient(to bottom, var(--mask-opaque) calc(100% - 3lh), transparent)",
                    }
                  : null),
              }
            : undefined
        }
      >
        {children}
      </div>
      {overflows || open ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="mt-2 cursor-pointer border-0 bg-transparent p-0 text-body-sm font-medium text-[var(--fg-primary)] underline underline-offset-[3px]"
        >
          {open ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  )
}
