"use client"

/**
 * Stats panel beside the endorsement graph. All figures are derived from
 * the already-loaded graph data (no extra fetch). Clicking a ranked person
 * focuses that node in the graph via `onFocus`.
 */

import { useMemo } from "react"
import Avatar from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils/initials"
import type { EndorsementGraph, GraphNode } from "@/hooks/use-endorsement-graph"

interface EndorsementStatsProps {
  graph: EndorsementGraph
  onFocus: (did: string) => void
}

function Rank({
  title,
  nodes,
  metric,
  onFocus,
}: {
  title: string
  nodes: GraphNode[]
  metric: (n: GraphNode) => number
  onFocus: (did: string) => void
}) {
  return (
    <section className="viz__rank">
      <h2 className="font-headline text-h4">{title}</h2>
      <div className="viz__rank-list">
        {nodes.map((n) => (
          <button
            key={n.id}
            type="button"
            className="viz__rank-item press-scale"
            onClick={() => onFocus(n.id)}
          >
            <Avatar
              src={n.avatarUrl || undefined}
              size="sm"
              fallbackInitials={getInitials(n.displayName, n.id)}
            />
            <span className="viz__rank-name">
              <span className="viz__rank-name-primary">
                {n.displayName || (n.handle ? `@${n.handle}` : n.id.slice(0, 16) + "…")}
              </span>
              {n.handle && n.displayName && (
                <span className="viz__rank-name-secondary">@{n.handle}</span>
              )}
            </span>
            <span className="viz__rank-count">{metric(n)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function EndorsementStats({ graph, onFocus }: EndorsementStatsProps) {
  const { nodes, totalEndorsements, mutualPairs } = graph

  const stats = useMemo(() => {
    const participants = nodes.length
    const avg = participants > 0 ? totalEndorsements / participants : 0
    // Reciprocity: share of directed edges that are part of a mutual pair.
    const reciprocity =
      totalEndorsements > 0 ? Math.round(((mutualPairs * 2) / totalEndorsements) * 100) : 0
    return { participants, avg, reciprocity }
  }, [nodes.length, totalEndorsements, mutualPairs])

  const topEndorsers = useMemo(
    () =>
      [...nodes]
        .filter((n) => n.given > 0)
        .sort((a, b) => b.given - a.given)
        .slice(0, 8),
    [nodes],
  )

  const topEndorsed = useMemo(
    () =>
      [...nodes]
        .filter((n) => n.received > 0)
        .sort((a, b) => b.received - a.received)
        .slice(0, 8),
    [nodes],
  )

  return (
    <aside className="viz__sidebar">
      <div className="viz__stats-grid">
        <div className="viz__stat">
          <span className="viz__stat-value">{totalEndorsements.toLocaleString()}</span>
          <span className="viz__stat-label">Endorsements</span>
        </div>
        <div className="viz__stat">
          <span className="viz__stat-value">{stats.participants.toLocaleString()}</span>
          <span className="viz__stat-label">People</span>
        </div>
        <div className="viz__stat">
          <span className="viz__stat-value">{mutualPairs.toLocaleString()}</span>
          <span className="viz__stat-label">Mutual pairs</span>
        </div>
        <div className="viz__stat">
          <span className="viz__stat-value">{stats.reciprocity}%</span>
          <span className="viz__stat-label">Reciprocity</span>
        </div>
      </div>

      {topEndorsers.length > 0 && (
        <Rank
          title="Top endorsers"
          nodes={topEndorsers}
          metric={(n) => n.given}
          onFocus={onFocus}
        />
      )}

      {topEndorsed.length > 0 && (
        <Rank
          title="Most endorsed"
          nodes={topEndorsed}
          metric={(n) => n.received}
          onFocus={onFocus}
        />
      )}

      {graph.truncated && (
        <p className="viz__notice">
          Showing a subset of the network — the full dataset exceeds the display cap.
        </p>
      )}
    </aside>
  )
}
