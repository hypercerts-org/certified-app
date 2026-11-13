"use client"

import { useParams } from "next/navigation"
import { usePageTitle } from "@/lib/navbar-context"
import OrgSettings from "@/components/groups/org-settings"
import { GroupAccessPage, useGroupAccess } from "@/components/groups/group-access"

/**
 * `/groups/{did}/settings`: the group's settings, for its members. While
 * the session and the group list load it shows a spinner; signed out it
 * asks to sign in; a signed-in visitor who isn't a member gets an
 * explanation and a link to the group's profile (it used to spin forever).
 */
export default function OrgSettingsPage() {
  usePageTitle("Group settings")
  const params = useParams()
  const groupDid = decodeURIComponent(params.groupDid as string)
  const access = useGroupAccess(groupDid)

  if (access.status !== "member") {
    return (
      <GroupAccessPage
        access={access}
        groupDid={groupDid}
        title="Group settings"
        signedOutTitle="Sign in to manage this group"
        signedOutDescription="Group settings are open to the group's members."
      />
    )
  }

  return <OrgSettings groupDid={groupDid} org={access.org} />
}
