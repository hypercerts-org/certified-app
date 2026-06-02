"use client"

import { useEffect, useRef, useState } from "react"
import { useNetworkCounts } from "@/hooks/use-network-counts"

/**
 * Five live network-wide counters slotted between WhatYouGet and
 * HowItWorks on the /welcome landing page. Users / Organizations
 * / Achievements / Projects / Endorsements (the last with a NEW
 * pill — endorsements only just shipped on this branch).
 *
 * Tiles render `—` while the indexer fetch is in flight and on
 * per-op failure; otherwise the formatted count with
 * `Intl.NumberFormat` thousands separators. Once a value lands it
 * counts up from 0 with ease-out; every tile shares the same
 * duration so a 12-counter and a 4,800-counter land together,
 * and a staggered start cascades them in left-to-right.
 *
 * Sectioning mirrors the existing landing-section conventions
 * (`.landing-section`, `.landing-section__inner`,
 * `.landing-section__header`, `.landing-label`) so the visual
 * rhythm matches the surrounding sections.
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
      className="landing-section landing-section--subtle network-stats"
      aria-labelledby="network-stats-heading"
    >
      <div className="landing-section__inner">
        <div className="landing-section__header landing-section__header--center">
          <span className="landing-label">By the numbers</span>
          <h2 id="network-stats-heading">A network you can build on</h2>
          <p className="landing-protocol__intro">
            Live counts from the Certified network.
          </p>
        </div>

        <ul
          className="network-stats__grid"
          aria-busy={isLoading}
          aria-live="polite"
        >
          {items.map((item, index) => (
            <li key={item.key} className="network-stats__tile">
              <div className="network-stats__value-row">
                <span
                  className="network-stats__value"
                  data-loading={item.value === null}
                >
                  <AnimatedCount
                    value={item.value}
                    delayMs={index * STAGGER_MS}
                  />
                </span>
                {item.isNew ? (
                  <span className="network-stats__new" aria-label="New">
                    NEW
                  </span>
                ) : null}
              </div>
              <span className="network-stats__label">{item.label}</span>
            </li>
          ))}
        </ul>
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

// Equal duration regardless of magnitude so tiles with very
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
