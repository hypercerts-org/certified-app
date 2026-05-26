"use client"

import { useEffect, useRef } from "react"

interface LoadMoreSentinelProps {
  onLoadMore: () => void
  isLoading: boolean
  /** Override the wrapper class when the sentinel needs to fit
   *  a surface's existing layout (e.g. `explore__load-more`). */
  className?: string
  /** Override the button class for the same reason. */
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
  return (
    <div ref={ref} className={className}>
      <button
        type="button"
        className={buttonClassName}
        onClick={onLoadMore}
        disabled={isLoading}
      >
        {isLoading ? "Loading…" : label}
      </button>
    </div>
  )
}
