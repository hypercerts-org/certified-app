"use client"

import { useCallback, useState } from "react"
import dynamic from "next/dynamic"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import EndorsementStats from "@/components/visualization/endorsement-stats"
import {
  useEndorsementGraph,
  type EndorsementGraph as EndorsementGraphData,
} from "@/hooks/use-endorsement-graph"
import { usePageTitle } from "@/lib/navbar-context"
import type { FocusRequest } from "@/components/visualization/endorsement-graph"

// Canvas/`window`-dependent — load client-only.
const EndorsementGraph = dynamic(
  () => import("@/components/visualization/endorsement-graph"),
  {
    ssr: false,
    loading: () => (
      <div className="viz__state">
        <LoadingSpinner size="md" />
      </div>
    ),
  },
)

export default function Visualization() {
  const { graph, isLoading, error } = useEndorsementGraph()
  const [focusReq, setFocusReq] = useState<FocusRequest>({ did: null, nonce: 0 })
  // Stats of the currently-visible (filtered) graph, emitted by the graph
  // component so the sidebar mirrors the active scope / mutual filters.
  // Falls back to the full graph until the first emit.
  const [statsGraph, setStatsGraph] = useState<EndorsementGraphData | null>(null)

  // Shows "Endorsement network" in the top bar next to the brandmark (which
  // replaces the wordmark whenever a page title is set).
  usePageTitle("Endorsement network")

  const handleFocus = useCallback((did: string) => {
    setFocusReq((prev) => ({ did, nonce: prev.nonce + 1 }))
  }, [])

  return (
    <div className="viz">
      <div className="viz__main">
        <div className="viz__graph">
          {isLoading && (
            <div className="viz__state">
              <LoadingSpinner size="md" />
            </div>
          )}

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
            />
          )}
        </div>
      </div>

      {!isLoading && !error && graph && graph.nodes.length > 0 && (
        <EndorsementStats graph={statsGraph ?? graph} onFocus={handleFocus} />
      )}
    </div>
  )
}
