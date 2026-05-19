"use client"

import { useNetworkCounts } from "@/hooks/use-network-counts"

/**
 * Network-wide counters for the /welcome landing page. Five
 * tiles: Users / Organizations / Certs / Projects / Endorsements.
 * The last one carries a "NEW" badge — endorsements only just
 * shipped on `feat/positioning-redesign`.
 *
 * Each tile shows `—` while loading (or on per-op failure) and
 * the formatted number once available. Numbers are formatted with
 * `Intl.NumberFormat` for thousands separators.
 *
 * Data flows from `useNetworkCounts`, which dedupes + caches the
 * 5-op GraphQL fan-out at the module level so a re-render or a
 * page revisit within 5 minutes is free.
 */
export default function NetworkStats() {
  const { counts, isLoading } = useNetworkCounts()

  const items: { key: string; label: string; value: number | null; isNew?: boolean }[] = [
    { key: "users", label: "Users", value: counts.users },
    {
      key: "organizations",
      label: "Organizations",
      value: counts.organizations,
    },
    { key: "certs", label: "Achievements", value: counts.certs },
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
