"use client"

/**
 * Stats panel beside the endorsement graph. All figures are derived from
 * the already-loaded graph data (no extra fetch). Clicking a ranked person
 * focuses that node in the graph via `onFocus`.
 *
 * From 1100px the panel scrolls inside the graph row; while more of it is
 * below the visible edge it carries `data-more-below`, which fades its
 * bottom edge (visualization.css), so a cut-off row reads as "more below".
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import Avatar from "@/components/ui/avatar"
import SectionHeader from "@/components/ui/section-header"
import StatRow from "@/components/ui/stat-row"
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
  const titleId = useId()
  return (
    <section className="viz__rank" aria-labelledby={titleId}>
      <SectionHeader id={titleId} title={title} />
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
              fallbackInitials={getInitials(n.displayName, n.handle)}
            />
            <span className="viz__rank-name">
              <span className="viz__rank-name-primary" dir="auto">
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
  const { nodes, totalEndorsements, totalAwards, mutualPairs } = graph

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

  // Whether more of the panel is below its scrolled edge. Re-checked on
  // scroll, when the panel or its sections change size (a breakpoint, the
  // window, a filter that changes the rankings), and when the data does.
  const asideRef = useRef<HTMLElement | null>(null)
  const [moreBelow, setMoreBelow] = useState(false)
  const checkMoreBelow = useCallback(() => {
    const el = asideRef.current
    if (!el) return
    // 1px of slack for fractional scroll positions at the end.
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 1)
  }, [])
  useEffect(() => {
    const el = asideRef.current
    if (!el) return
    checkMoreBelow()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(checkMoreBelow)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => ro.disconnect()
  }, [checkMoreBelow, graph])

  return (
    <aside
      ref={asideRef}
      className="viz__sidebar"
      data-more-below={moreBelow ? "" : undefined}
      onScroll={checkMoreBelow}
    >
      <StatRow
        aria-label="Network totals"
        items={[
          { label: "Endorsements", value: totalEndorsements.toLocaleString() },
          { label: "Awards", value: totalAwards.toLocaleString() },
          { label: "People", value: stats.participants.toLocaleString() },
          { label: "Mutual pairs", value: mutualPairs.toLocaleString() },
          { label: "Reciprocity", value: `${stats.reciprocity}%` },
        ]}
      />

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
