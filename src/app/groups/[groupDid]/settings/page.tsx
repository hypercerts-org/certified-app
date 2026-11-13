"use client"

import { useParams } from "next/navigation"
import { useOrg } from "@/lib/groups/org-context"
import { usePageTitle } from "@/lib/navbar-context"
import OrgSettings from "@/components/groups/org-settings"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import Skeleton from "@/components/ui/skeleton"

export default function OrgSettingsPage() {
  usePageTitle("Group settings")
  const params = useParams()
  const groupDid = decodeURIComponent(params.groupDid as string)
  const { groups } = useOrg()

  const org = groups.find((o) => o.groupDid === groupDid)

  // Until the viewer's groups resolve, hold the page's shape: the header,
  // the section nav and a few rows.
  if (!org) {
    return (
      <PageContainer>
        <PageHeader title="Settings" description="Settings for this group." />
        <div
          aria-busy="true"
          className="grid grid-cols-1 gap-6 lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:items-start lg:gap-12"
        >
          <Skeleton variant="line" width="100%" height={40} count={3} />
          <Skeleton variant="line" width="100%" height={56} count={3} />
        </div>
      </PageContainer>
    )
  }

  return <OrgSettings groupDid={groupDid} org={org} />
}
