"use client"

import { HandCoins } from "lucide-react"
import EmptyState from "@/components/ui/empty-state"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import { usePageTitle } from "@/lib/navbar-context"

/**
 * Network → Funding (`/funding`): a placeholder until the funding view
 * exists (who funded which work), so the menu item says what is coming
 * instead of showing an empty page. Explore's Funding list stays the place
 * to browse individual funding records.
 */
export default function FundingPage() {
  usePageTitle("Funding")
  return (
    <PageContainer className="funding-page">
      <PageHeader title="Funding" description="Who funds which work across the Certified network." />
      <EmptyState
        icon={HandCoins}
        headingLevel={2}
        title="The funding view is on its way"
        description="Soon you'll see who funded which projects and activities, and how funding connects the network."
      />
    </PageContainer>
  )
}
