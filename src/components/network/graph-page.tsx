"use client"

import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import Visualization from "@/components/visualization/visualization"
import { usePageTitle } from "@/lib/navbar-context"

/**
 * Network → Graph (`/graph`): the endorsement network — who endorses whom
 * across Certified — as the interactive graph with its stats beside it.
 * Public, like Explore. Reached from the Network menu.
 */
export default function GraphPage() {
  usePageTitle("Graph")
  return (
    <PageContainer className="graph-page">
      <PageHeader
        title="Graph"
        description="Who endorses whom across the Certified network: each dot is an account, each line an endorsement."
      />
      <div data-tour="graph">
        <Visualization embedded />
      </div>
    </PageContainer>
  )
}
