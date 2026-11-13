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
import WorkspaceShell from "@/components/layout/workspace-shell"
import Card from "@/components/ui/card"
import { HomeIdSection, HomeIdentityHeader } from "@/components/home/home-account-card"
import {
  HomeApps,
  HomeEndorsements,
  HomeGroups,
  HomeRecords,
} from "@/components/home/home-sections"

/**
 * Workspace → Overview (`/home`): the account and what it holds, inside
 * the Workspace frame (its side list leads to the Records sections and
 * Groups). The follow feed has its own page, /feed.
 *
 *   ≥ 1300px (beside the side list)             < 1300px (one column)
 *   ┌──────────────────────┐ ┌───────────┐      header
 *   │ header: avatar, name │ │ ID (box)  │      ID (box)
 *   │ bio, website         │ └───────────┘      Your groups (box)
 *   │ Your records         │ ┌───────────┐      Your records
 *   │ Endorsements and     │ │ Your      │      Endorsements and
 *   │   followers          │ │ groups    │        followers
 *   │ Apps                 │ └───────────┘      Apps
 *   └──────────────────────┘
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
    // The Workspace frame (its side list, width and gutters); `home-page`
    // scopes the Overview's own rules in home.css.
    <WorkspaceShell current="overview" className="home-page">
      {/* Spinner while auth resolves, while the signed-out redirect is in
          flight, or while the acting-as DID is still resolving. */}
      {authLoading || !isAuthenticated || !activeDid ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="md" />
        </div>
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
    // DOM order is the phone order: header, the ID and Your groups boxes,
    // the sections (records, from others), Apps. From 1300px (beside the
    // Workspace side list) a grid puts the two boxes in a column on the
    // right, level with the header (home.css).
    <div className="home__layout">
      <div className="home__header">
        <HomeIdentityHeader identity={identity} activeGroup={activeGroup} />
      </div>

      {/* White boxes, so the ID and the groups stand out from the open
          sections. */}
      <div className="home__side">
        <Card unpadded className="home__box">
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
  )
}
