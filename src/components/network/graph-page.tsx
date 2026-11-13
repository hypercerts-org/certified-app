"use client"

import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import NetworkNav from "@/components/layout/network-nav"
import Visualization from "@/components/visualization/visualization"
import { usePageTitle } from "@/lib/navbar-context"

/**
 * Network → Graph (`/graph`): the endorsement network — who endorses whom
 * across Certified — as the interactive graph with its stats beside it.
 * Public, like Explore.
 */
export default function GraphPage() {
  usePageTitle("Graph")
  return (
    <PageContainer className="graph-page">
      <NetworkNav current="graph" />
      <PageHeader
        title="Graph"
        description="Who endorses whom across the Certified network: each dot is an account, each line an endorsement."
      />
      <Visualization embedded />
    </PageContainer>
  )
}
