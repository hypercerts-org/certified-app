"use client"

import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import Visualization from "@/components/visualization/visualization"
import { usePageTitle } from "@/lib/navbar-context"

/**
 * Network → Graph (`/graph`): who vouches for whom across Certified —
 * endorsements, recognitions, certifications, awards and participation
 * badges — as the interactive graph with its controls and stats beside it.
 * Public, like Explore. Reached from the Network menu.
 */
export default function GraphPage() {
  usePageTitle("Graph")
  return (
    <PageContainer className="graph-page">
      <PageHeader
        title="Graph"
        description="Who vouches for whom across the Certified network: each dot is an account, each line a badge one gave the other."
      />
      <div data-tour="graph">
        <Visualization embedded />
      </div>
    </PageContainer>
  )
}
