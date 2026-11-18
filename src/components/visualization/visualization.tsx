"use client"

import { useCallback, useState } from "react"
import dynamic from "next/dynamic"
import { Filter as FilterIcon } from "lucide-react"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import Skeleton from "@/components/ui/skeleton"
import StatRow from "@/components/ui/stat-row"
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

// The network fetch can take up to a minute, so pair the brandmark with a
// visible status line, in the words and the quiet mark Map and Funding use
// for their first load. The spinner's own live region is hidden so the
// message is announced once.
export const GRAPH_LOADING_TEXT =
  "Gathering every endorsement and badge on the network. The first load can take up to a minute."

function GraphLoading() {
  return (
    <div className="viz__state viz__state--loading">
      <div aria-hidden="true">
        <LoadingSpinner size="md" />
      </div>
      <p className="viz__state-text" role="status" aria-live="polite">
        {GRAPH_LOADING_TEXT}
      </p>
    </div>
  )
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/** The find field and Filters button while the network loads (below
 *  1100px), so the graph doesn't move down when the real ones arrive.
 *  Hidden once the graph has put its own toolbar in the slot before it
 *  (visualization.css). Not interactive: nothing to find or filter yet. */
function ToolbarPlaceholder() {
  return (
    <div className="viz__toolbar viz__toolbar--placeholder" aria-hidden="true">
      <div className="viz__search-wrap">
        <Input disabled tabIndex={-1} placeholder="Find account" className="viz__search" />
      </div>
      <Button variant="secondary" size="md" disabled tabIndex={-1} className="network-filters__btn">
        <FilterIcon size={16} strokeWidth={1.75} aria-hidden />
        Filters
      </Button>
    </div>
  )
}

/** The labels of the network totals (EndorsementStats), for their
 *  skeleton while the network loads. */
const TOTAL_LABELS = ["Endorsements", "Other badges", "Accounts", "Mutual pairs", "Reciprocity"]

/** The side column's controls while the network loads (from 1100px): the
 *  panel's shape (the find field, then Layout, Show and Lines waiting in
 *  place), so the column doesn't pop in beside the graph when the network
 *  arrives. Hidden once the graph has put its own controls in the slot
 *  before it (visualization.css). Not interactive: nothing to find or
 *  filter yet. */
function ControlsPlaceholder() {
  return (
    <div className="viz__controls viz__controls--placeholder" aria-hidden="true">
      <div className="viz__search-wrap">
        <Input disabled tabIndex={-1} placeholder="Find account" className="viz__search" />
      </div>
      <div className="viz__control-row">
        <span className="viz__control-label">Layout</span>
        <Skeleton variant="box" width={168} height={32} />
      </div>
      <div className="viz__control-row">
        <span className="viz__control-label">Show</span>
        <Skeleton variant="box" width={216} height={32} />
      </div>
      <div className="viz__control-row viz__control-row--top">
        <span className="viz__control-label">Lines</span>
        <div className="viz__kind-row">
          {[120, 128, 124, 96, 112, 100].map((w, i) => (
            <span key={i} className="viz__kind-placeholder">
              <Skeleton variant="line" width={w} height={14} />
            </span>
          ))}
        </div>
      </div>
      <div className="viz__legend">
        <Skeleton variant="line" width="70%" height={12} />
      </div>
    </div>
  )
}

/** The network totals under the controls, waiting in place (from 1100px). */
function TotalsPlaceholder() {
  return (
    <div className="viz__totals-placeholder" aria-hidden="true">
      <StatRow items={TOTAL_LABELS.map((label) => ({ label, value: null, loading: true }))} />
    </div>
  )
}

/** The one line of totals above the graph below 1100px, in place of the
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
 * layout, which accounts and lines) above the stats. Below 1100px (phones
 * and the 800-1099px rail layout) the graph comes first: one line of
 * totals, the find field and a Filters button (Layout, Show, Lines in a
 * sheet), the graph, then the rankings. Both lines hold their place while
 * the network loads. On phones the selected account's card sits under the
 * graph, not over it.
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
  // Phones: where the selected account's card goes (under the graph).
  const [panelHost, setPanelHost] = useState<HTMLDivElement | null>(null)
  const ready = !isLoading && !error && graph && graph.nodes.length > 0
  const { isDesktop, hasRightRail } = useLayoutBreakpoints()
  // Below 1100px the totals are one line and the controls one row above
  // the graph; from 1100px they are a column beside it.
  const compact = !hasRightRail

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
              compact={compact}
              panelHost={isDesktop ? null : panelHost}
            />
          )}
        </div>
        {!isDesktop ? <div ref={setPanelHost} className="viz__panel-slot" /> : null}
      </div>

      {/* Beside the graph from 1100px: its controls, then the totals and
          rankings. Below that the totals line and the find + Filters row
          sit above the graph and the rankings under it (visualization.css). */}
      <div className="viz__side">
        {/* The totals wait for the shown graph's own stats (onStats): the
            raw network's larger numbers would flash first. */}
        {compact && ready && statsGraph ? (
          <p className="viz__summary">{graphSummary(statsGraph)}</p>
        ) : compact && (isLoading || ready) ? (
          <div className="viz__summary viz__summary--loading" aria-hidden="true">
            <Skeleton variant="line" width={260} height={12} />
          </div>
        ) : null}
        <div ref={setControlsHost} className="viz__nav" />
        {/* Both shapes while the controls are on their way: the CSS shows
            the row below 1100px and the panel and totals from 1100px, so
            the server render (before the width is known) holds the right
            one too. */}
        {isLoading || ready ? <ToolbarPlaceholder /> : null}
        {isLoading || ready ? <ControlsPlaceholder /> : null}
        {isLoading || (ready && !statsGraph) ? <TotalsPlaceholder /> : null}
        {ready && statsGraph ? (
          <EndorsementStats
            graph={statsGraph}
            onFocus={handleFocus}
            showTotals={!compact}
          />
        ) : null}
      </div>
    </div>
  )
}
