"use client"

import { useCallback, useState } from "react"
import dynamic from "next/dynamic"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import EndorsementStats from "@/components/visualization/endorsement-stats"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import {
  useEndorsementGraph,
  type EndorsementGraph as EndorsementGraphData,
} from "@/hooks/use-endorsement-graph"
import type { FocusRequest } from "@/components/visualization/endorsement-graph"

// Canvas/`window`-dependent — load client-only.
const EndorsementGraph = dynamic(
  () => import("@/components/visualization/endorsement-graph"),
  {
    ssr: false,
    loading: () => <GraphLoading />,
  },
)

// The network fetch can take several seconds, so pair the brandmark with a
// visible status line. The spinner's own live region is hidden so the
// message is announced once.
function GraphLoading() {
  return (
    <div className="viz__state viz__state--loading">
      <div aria-hidden="true">
        <LoadingSpinner size="md" />
      </div>
      <p className="viz__state-text" role="status" aria-live="polite">
        Loading endorsement network…
      </p>
    </div>
  )
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/** The phone's one line of totals above the graph, in place of the
 *  StatRow: "205 accounts · 258 endorsements · 1 mutual pair". */
export function graphSummary(g: EndorsementGraphData): string {
  return [
    plural(g.nodes.length, "account", "accounts"),
    plural(g.totalEndorsements, "endorsement", "endorsements"),
    plural(g.mutualPairs, "mutual pair", "mutual pairs"),
  ].join(" · ")
}

/**
 * The endorsement network: the graph, and beside it its controls (find,
 * layout, which accounts and lines) above the stats. On phones the graph
 * comes first: one line of totals, the find field and a Filters button
 * (Layout, Show, Lines in a bottom sheet), the graph, then the rankings.
 * Network → Graph (`/graph`) hosts it `embedded`, inside its page container under the
 * Network tabs. Without `embedded` it takes the full-bleed page layout
 * (`.viz--page`: full shell width, viewport-tall on wide screens), which no
 * route uses at the moment (`/endorsement-graph` redirects to `/graph`).
 * The host page sets its own title; this component never touches the
 * chrome.
 */
export default function Visualization({ embedded = false }: { embedded?: boolean } = {}) {
  const { graph, isLoading, error } = useEndorsementGraph()
  const [focusReq, setFocusReq] = useState<FocusRequest>({ did: null, nonce: 0 })
  // Stats of the currently-visible (filtered) graph, emitted by the graph
  // component so the sidebar mirrors the active scope / mutual filters.
  // Falls back to the full graph until the first emit.
  const [statsGraph, setStatsGraph] = useState<EndorsementGraphData | null>(null)
  // The graph's controls render here, beside it, not over it.
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null)
  const ready = !isLoading && !error && graph && graph.nodes.length > 0
  const { isDesktop } = useLayoutBreakpoints()

  const handleFocus = useCallback((did: string) => {
    setFocusReq((prev) => ({ did, nonce: prev.nonce + 1 }))
  }, [])

  return (
    <div className={embedded ? "viz" : "viz viz--page"}>
      <div className="viz__main">
        <div className="viz__graph" aria-busy={isLoading || undefined}>
          {isLoading && <GraphLoading />}

          {!isLoading && error && (
            <div className="viz__state">
              <EmptyState
                variant="rich"
                title="Couldn't load the network"
                description={error}
              />
            </div>
          )}

          {!isLoading && !error && graph && graph.nodes.length === 0 && (
            <div className="viz__state">
              <EmptyState
                variant="rich"
                title="No endorsements yet"
                description="Once people start endorsing each other, the network will appear here."
              />
            </div>
          )}

          {!isLoading && !error && graph && graph.nodes.length > 0 && (
            <EndorsementGraph
              nodes={graph.nodes}
              links={graph.links}
              focusReq={focusReq}
              truncated={graph.truncated}
              onStats={setStatsGraph}
              controlsHost={controlsHost}
            />
          )}
        </div>
      </div>

      {/* Beside the graph from 1100px: its controls, then the totals and
          rankings. Below that the controls sit above the graph and the
          stats under it; on phones the totals line and the find + Filters
          row sit above it (visualization.css). */}
      <div className="viz__side">
        {ready && !isDesktop ? (
          <p className="viz__summary">{graphSummary(statsGraph ?? graph)}</p>
        ) : null}
        <div ref={setControlsHost} className="viz__nav" />
        {ready && (
          <EndorsementStats
            graph={statsGraph ?? graph}
            onFocus={handleFocus}
            showTotals={isDesktop}
          />
        )}
      </div>
    </div>
  )
}
