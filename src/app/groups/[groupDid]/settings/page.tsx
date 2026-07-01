"use client"

import { useParams } from "next/navigation"
import { useOrg } from "@/lib/groups/org-context"
import { usePageTitle } from "@/lib/navbar-context"
import OrgSettings from "@/components/groups/org-settings"
import LoadingSpinner from "@/components/ui/loading-spinner"

export default function OrgSettingsPage() {
  usePageTitle("Group Settings")
  const params = useParams()
  const groupDid = decodeURIComponent(params.groupDid as string)
  const { groups } = useOrg()

  const org = groups.find((o) => o.groupDid === groupDid)

  if (!org) {
    return (
      <div className="dashboard">
        <div className="dashboard__body dashboard__body--single">
          <div className="dashboard__main">
            <LoadingSpinner size="sm" />
          </div>
        </div>
      </div>
    )
  }

  return <OrgSettings groupDid={groupDid} org={org} />
}
