"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useOrg } from "@/lib/groups/org-context"
import { useActorWorkspaceCounts } from "@/hooks/use-workspace"
import { usePageTitle } from "@/lib/navbar-context"
import { ownProfileUrl } from "@/lib/urls"
import type { Group } from "@/lib/groups/types"
import LoadingSpinner from "@/components/ui/loading-spinner"
import WorkspaceShell, { WorkspaceFrame } from "@/components/layout/workspace-shell"
import Card from "@/components/ui/card"
import {
  HomeIdSection,
  HomeIdentityHeader,
  HomeIdentityHeaderSkeleton,
} from "@/components/home/home-account-card"
import {
  HomeApps,
  HomeEndorsements,
  HomeGroups,
  HomeRecords,
} from "@/components/home/home-sections"

/**
 * Workspace → Overview (`/home`): the account and what it holds, in the
 * Workspace frame (the header full width, then its side list, which leads
 * to the Records sections and Groups, beside the content). The follow
 * feed has its own page, /feed.
 *
 *   ≥ 1100px                                      < 1100px (one column)
 *   header: avatar, name, bio, website            header
 *   ┌──────┐ ┌──────────────────┐ ┌───────────┐   side list (pills)
 *   │ side │ │ Your records     │ │ ID (box)  │   ID (box)
 *   │ list │ │ Endorsements and │ └───────────┘   Your groups (box)
 *   │      │ │   followers      │ ┌───────────┐   Your records
 *   │      │ │ Apps             │ │ Your      │   Endorsements and
 *   └──────┘ └──────────────────┘ │ groups    │     followers
 *                                 └───────────┘   Apps
 *
 * Everything describes the account the viewer is acting as: the personal
 * account, or the group picked in the Workspace menu. "Your groups" is
 * personal-only.
 */
export default function Home() {
  usePageTitle("Workspace")
  const router = useRouter()
  const { isLoading: authLoading, isAuthenticated, did: personalDid } = useAuth()
  const { handle: personalHandle } = useSession()
  const { activeOrg } = useOrg()

  // The identity the page is about: the group picked in the account
  // switcher, or the personal account.
  const activeDid = activeOrg?.groupDid || personalDid

  // /home is a signed-in-only surface. Once auth resolves to signed-out,
  // redirect to the marketing landing rather than showing a sign-in empty
  // state. Runs in an effect because router.replace can't fire during
  // render. This backstops direct navigation, the bottom-nav Home tab, and
  // a click during the auth-loading tick.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/welcome")
    }
  }, [authLoading, isAuthenticated, router])

  // The profile of the account the Overview is about: the acting-as
  // identity's handle URL, falling back to its DID so links work before
  // the handle has resolved.
  const profileBase = ownProfileUrl({
    activeGroup: activeOrg,
    personalHandle,
    personalDid,
  })

  return (
    // The Workspace page (width and gutters); `home-page` scopes the
    // Overview's own rules in home.css.
    <WorkspaceShell current="overview" className="home-page">
      {/* While auth resolves, while the signed-out redirect is in flight,
          or while the acting-as DID is still resolving: the header's
          placeholder, the side list and a spinner. */}
      {authLoading || !isAuthenticated || !activeDid ? (
        <WorkspaceFrame header={<HomeIdentityHeaderSkeleton />}>
          <div className="flex justify-center py-16">
            <LoadingSpinner size="md" />
          </div>
        </WorkspaceFrame>
      ) : (
        // Keyed on the account: switching account keeps the /home path,
        // so without a remount every section would keep showing the
        // previous account's profile and records until its refetch landed.
        <HomeAccount
          key={activeDid}
          did={activeDid}
          activeGroup={activeOrg ?? null}
          profileBase={profileBase}
        />
      )}
    </WorkspaceShell>
  )
}

function HomeAccount({
  did,
  activeGroup,
  profileBase,
}: {
  did: string
  activeGroup: Group | null
  profileBase: string
}) {
  const isGroup = !!activeGroup
  // One profile fetch feeds both the header and the ID card.
  const { profile, avatarUrl, handle, isLoading } = useUserProfile(did)
  const { counts, isLoading: countsLoading } = useActorWorkspaceCounts(did)
  const identity = { did, profile, avatarUrl, handle, isLoading }

  return (
    // The header is the frame's (full width, above the side list). The
    // content opens with "Your records" (a section heading), so it takes
    // the frame's offset and sits level with the first side-list label.
    <WorkspaceFrame header={<HomeIdentityHeader identity={identity} activeGroup={activeGroup} />}>
      {/* DOM order is the phone order: the ID and Your groups boxes, the
          sections (records, from others), Apps. From 1100px a grid puts
          the two boxes in a column on the right, its top level with the
          sections (home.css). */}
      <div className="home__layout">
        {/* White boxes, so the ID and the groups stand out from the open
            sections. */}
        <div className="home__side">
          {/* The ID card: a centerpiece every style can redraw (looks.css);
              data-did feeds Banknote's microtext. */}
          <Card unpadded className="home__box" data-centerpiece="id" data-did={did}>
            <HomeIdSection
              identity={identity}
              isGroup={isGroup}
              canEditHandle={
                !activeGroup || activeGroup.role === "owner" || activeGroup.role === "admin"
              }
            />
          </Card>
          {isGroup ? null : (
            <Card unpadded className="home__box">
              <HomeGroups />
            </Card>
          )}
        </div>

        <div className="home__main">
          <HomeRecords
            did={did}
            isGroup={isGroup}
            profileBase={profileBase}
            counts={counts}
            countsLoading={countsLoading}
          />
          <HomeEndorsements
            did={did}
            isGroup={isGroup}
            profileBase={profileBase}
            counts={counts}
            countsLoading={countsLoading}
          />
        </div>

        <div className="home__apps">
          <HomeApps />
        </div>
      </div>
    </WorkspaceFrame>
  )
}
