"use client"

import { useNetworkCounts } from "@/hooks/use-network-counts"

/**
 * Five live network-wide counters slotted between WhatYouGet and
 * HowItWorks on the /welcome landing page. Users / Organizations
 * / Achievements / Projects / Endorsements (the last with a NEW
 * pill — endorsements only just shipped on this branch).
 *
 * Tiles render `—` while the indexer fetch is in flight and on
 * per-op failure; otherwise the formatted count with
 * `Intl.NumberFormat` thousands separators.
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
    { key: "achievements", label: "Achievements", value: counts.achievements },
    { key: "projects", label: "Projects", value: counts.projects },
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
            Live counts from the Certified atproto network.
          </p>
        </div>

        <ul
          className="network-stats__grid"
          aria-busy={isLoading}
          aria-live="polite"
        >
          {items.map((item) => (
            <li key={item.key} className="network-stats__tile">
              <div className="network-stats__value-row">
                <span
                  className="network-stats__value"
                  data-loading={item.value === null}
                >
                  {formatCount(item.value)}
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

function formatCount(value: number | null): string {
  if (value === null) return "—"
  return FORMATTER.format(value)
}
