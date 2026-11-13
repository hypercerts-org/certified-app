"use client"

import { MapIcon } from "lucide-react"
import EmptyState from "@/components/ui/empty-state"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import { usePageTitle } from "@/lib/navbar-context"

/**
 * Network → Map (`/map`): a placeholder until the map exists, so the tab
 * says what is coming instead of showing an empty page.
 */
export default function MapPage() {
  usePageTitle("Map")
  return (
    <PageContainer className="map-page">
      <PageHeader title="Map" description="Where the work across the Certified network takes place." />
      {/* A tinted panel the width of the content, so the placeholder
          reads as a deliberate page rather than a lone note. */}
      <EmptyState
        className="rounded bg-[var(--bg-sunken)] md:py-20"
        icon={MapIcon}
        headingLevel={2}
        title="The map is on its way"
        description="Soon you'll see activities and projects on a map, placed by the locations they record."
      />
    </PageContainer>
  )
}
