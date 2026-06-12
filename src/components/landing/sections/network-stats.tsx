"use client"

import { useEffect, useRef, useState } from "react"
import { useNetworkCounts } from "@/hooks/use-network-counts"

/**
 * Five live network-wide counters on the /welcome landing page —
 * Users / Organizations / Projects / Activities / Endorsements, the
 * last marked with a footnote asterisk (endorsements only just
 * shipped).
 *
 * Cells render `—` while the indexer fetch is in flight and on
 * per-op failure; otherwise the formatted count with
 * `Intl.NumberFormat` thousands separators. Once a value lands it
 * counts up from 0 with ease-out; every cell shares the same
 * duration so a 12-counter and a 4,800-counter land together, and a
 * staggered start cascades them in left-to-right.
 *
 * Layout is the editorial register row: big mono numerals over
 * small uppercase labels, divided by hairlines (see .lp-stats in
 * landing.css).
 */
export default function NetworkStats() {
  const { counts, isLoading } = useNetworkCounts()

  const items: {
    key: string
    label: string
    value: number | null
    isNew?: boolean
  }[] = [
    { key: "users", label: "Users", value: counts.users },
    {
      key: "organizations",
      label: "Organizations",
      value: counts.organizations,
    },
    { key: "projects", label: "Projects", value: counts.projects },
    { key: "achievements", label: "Activities", value: counts.achievements },
    {
      key: "endorsements",
      label: "Endorsements",
      value: counts.endorsements,
      isNew: true,
    },
  ]

  return (
    <section
      id="network-stats"
      className="lp-section lp-stats"
      aria-labelledby="lp-stats-title"
    >
      <div className="lp-section__inner">
        <header className="lp-section__header">
          <span className="lp-eyebrow">By the numbers</span>
          <h2 id="lp-stats-title" className="lp-h2">
            A network you can build on
          </h2>
        </header>

        {/* No aria-live here: the count-up mutates the text on every
            animation frame, which would flood screen readers with
            intermediate values. The numbers aren't urgent enough to
            announce; AT users read the settled values on arrival. */}
        <ul className="lp-stats__row" aria-busy={isLoading}>
          {items.map((item, index) => (
            <li key={item.key} className="lp-stats__cell">
              <span
                className="lp-stats__value"
                data-loading={item.value === null}
              >
                <AnimatedCount value={item.value} delayMs={index * STAGGER_MS} />
                {item.isNew ? (
                  <span className="lp-stats__star" aria-hidden="true">
                    *
                  </span>
                ) : null}
              </span>
              <span className="lp-stats__label">
                {item.label}
                {item.isNew ? <span className="sr-only"> (new)</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="lp-stats__footnote" aria-hidden="true">
          * new
        </p>
      </div>
    </section>
  )
}

const FORMATTER = new Intl.NumberFormat("en-US")
const COUNT_UP_MS = 1400
const STAGGER_MS = 110

function AnimatedCount({
  value,
  delayMs,
}: {
  value: number | null
  delayMs: number
}) {
  const display = useCountUp(value, delayMs)
  if (value === null || display === null) return <>—</>
  return <>{FORMATTER.format(display)}</>
}

// Equal duration regardless of magnitude so cells with very
// different targets land at the same moment. Subsequent updates
// (5-min cache refresh) animate from the last displayed value, not
// from 0, so a small delta doesn't whip back through the full range.
function useCountUp(target: number | null, delayMs: number): number | null {
  const [display, setDisplay] = useState<number | null>(null)
  const fromRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (target === null) return

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches
    if (reduced) {
      setDisplay(target)
      fromRef.current = target
      return
    }

    const from = fromRef.current
    const delta = target - from
    if (delta === 0) {
      setDisplay(target)
      return
    }

    let startedAt: number | null = null
    timeoutRef.current = window.setTimeout(() => {
      const tick = (now: number) => {
        if (startedAt === null) startedAt = now
        const t = Math.min(1, (now - startedAt) / COUNT_UP_MS)
        const eased = 1 - Math.pow(1 - t, 3)
        setDisplay(Math.round(from + delta * eased))
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          fromRef.current = target
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }, delayMs)

    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, delayMs])

  return display
}
