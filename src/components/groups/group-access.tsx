"use client"

import type { ReactNode } from "react"
import { Lock, LogIn, Users } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import type { Group } from "@/lib/groups/types"
import { profileUrl } from "@/lib/urls"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SignedOutPrompt from "@/components/layout/signed-out-prompt"

export type GroupAccess =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "not-member" }
  | { status: "member"; org: Group }

/**
 * Whether the viewer may open a group's admin pages (`/groups/{did}/…`):
 * signed in and a member of the group. The group list comes from the org
 * context, which starts loading and settles to `false` once the session is
 * known (also when signed out), so the result never hangs on "loading".
 *
 * The signed-in account can itself be the group (`selfGroup`); that counts
 * as membership too.
 */
export function useGroupAccess(groupDid: string): GroupAccess {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { groups, selfGroup, isLoading: orgLoading } = useOrg()

  const org =
    groups.find((g) => g.groupDid === groupDid) ??
    (selfGroup?.groupDid === groupDid ? selfGroup : null)

  if (org) return { status: "member", org }
  if (authLoading) return { status: "loading" }
  if (!isAuthenticated) return { status: "signed-out" }
  if (orgLoading) return { status: "loading" }
  return { status: "not-member" }
}

/**
 * The page for a group admin route that the viewer can't use yet: still
 * loading, signed out, or not a member. Renders the page's own header so
 * the route keeps one h1 and a way back to the group's profile (the
 * profile route takes a DID and canonicalises it to the handle).
 */
export function GroupAccessPage({
  access,
  groupDid,
  title,
  signedOutTitle,
  signedOutDescription,
}: {
  access: Exclude<GroupAccess, { status: "member" }>
  groupDid: string
  /** The page title, e.g. "Group settings". */
  title: string
  signedOutTitle: string
  signedOutDescription: string
}) {
  const groupHref = profileUrl(groupDid)
  let body: ReactNode
  if (access.status === "loading") {
    body = (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="md" />
      </div>
    )
  } else if (access.status === "signed-out") {
    body = (
      <SignedOutPrompt
        icon={LogIn}
        title={signedOutTitle}
        description={signedOutDescription}
        headingLevel={2}
      />
    )
  } else {
    body = (
      <EmptyState
        icon={Users}
        title="You're not a member of this group"
        description="Only the group's members can open this page. You can still see its public profile."
        headingLevel={2}
      >
        <Button href={groupHref} variant="secondary" size="sm">
          View group profile
        </Button>
      </EmptyState>
    )
  }

  return (
    <PageContainer width="narrow">
      <PageHeader back={{ href: groupHref, label: "Group profile" }} title={title} />
      {body}
    </PageContainer>
  )
}

/**
 * Shown on a group admin page to a member whose role can't make the change
 * (members, as opposed to owners and admins).
 */
export function GroupRoleRequired({
  groupDid,
  title,
  description,
}: {
  groupDid: string
  title: string
  description: string
}) {
  const groupHref = profileUrl(groupDid)
  return (
    <PageContainer width="narrow">
      <PageHeader back={{ href: groupHref, label: "Group profile" }} title={title} />
      <EmptyState
        icon={Lock}
        title="Only owners and admins can do this"
        description={description}
        headingLevel={2}
      >
        <Button href={groupHref} variant="secondary" size="sm">
          View group profile
        </Button>
      </EmptyState>
    </PageContainer>
  )
}
