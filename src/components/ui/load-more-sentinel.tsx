"use client"

import { useEffect, useRef } from "react"
import Button from "./button"

interface LoadMoreSentinelProps {
  onLoadMore: () => void
  isLoading: boolean
  /** Override the wrapper class when the sentinel needs to fit
   *  a surface's existing layout (e.g. `explore__load-more`). */
  className?: string
  /** Escape hatch: render a raw `<button>` with this class instead of the
   *  shared `<Button variant="secondary">`. Omit it (the default) to get the
   *  primitive. Kept for surfaces with bespoke load-more chrome. */
  buttonClassName?: string
  /** Override the button label. */
  label?: string
}

/**
 * Reusable infinite-scroll sentinel + manual "Load more" button.
 *
 * Renders an `IntersectionObserver`-tracked div with a button child.
 * When the div crosses 200px below the viewport, `onLoadMore` fires
 * automatically. The button is the visible affordance + a manual
 * fallback (keyboard users, browsers without IO).
 *
 * Each surface is responsible for hiding the sentinel when there's
 * nothing more to load — pass `<LoadMoreSentinel>` only while
 * `hasMore` is true.
 *
 * Originally inlined in `src/components/explore-page/explore.tsx`;
 * extracted here so the home feed and any future paginated surface
 * share the same observer + UX.
 */
export default function LoadMoreSentinel({
  onLoadMore,
  isLoading,
  className,
  buttonClassName,
  label = "Load more",
}: LoadMoreSentinelProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  // Capture the latest callback so the observer effect doesn't bind a
  // stale closure when the parent's `onLoadMore` identity changes.
  const cbRef = useRef(onLoadMore)
  useEffect(() => {
    cbRef.current = onLoadMore
  }, [onLoadMore])
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) cbRef.current()
        }
      },
      { rootMargin: "200px 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const content = isLoading ? "Loading…" : label
  return (
    <div ref={ref} className={className}>
      {buttonClassName ? (
        <button
          type="button"
          className={buttonClassName}
          onClick={onLoadMore}
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {content}
        </button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={onLoadMore}
          loading={isLoading}
        >
          {content}
        </Button>
      )}
    </div>
  )
}
