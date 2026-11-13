"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useOrg } from "@/lib/groups/org-context"
import { useActorWorkspaceCounts } from "@/hooks/use-workspace"
import { usePageTitle } from "@/lib/navbar-context"
import { isRouteVisibleToActor } from "@/lib/groups/personal-only"
import { ownProfileUrl } from "@/lib/urls"
import type { Group } from "@/lib/groups/types"
import LoadingSpinner from "@/components/ui/loading-spinner"
import PageContainer from "@/components/ui/page-container"
import { HomeIdSection, HomeIdentityHeader } from "@/components/home/home-account-card"
import {
  HomeApps,
  HomeGroups,
  HomeReceived,
  HomeRecords,
} from "@/components/home/home-sections"

/**
 * Signed-in home: the account and what it holds. The follow feed has its
 * own page, /feed.
 *
 *   ≥ 1100px                                    < 1100px (one column)
 *   header: avatar · name · bio · website       header
 *   ┌──────────────────────┐ ┌───────────┐      ID
 *   │ Your records         │ │ ID        │      Your records
 *   │ From others          │ │ Your      │      From others
 *   │ Apps                 │ │ groups    │      Your groups
 *   └──────────────────────┘ └───────────┘      Apps
 *
 * Everything describes the account the viewer is acting as: the personal
 * account, or the group picked in the account switcher. "Your groups" is
 * personal-only.
 */
export default function Home() {
  usePageTitle("Home")
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

  // Same target as the account menu's "View profile": the acting-as
  // identity's handle URL, falling back to its DID so links work before
  // the handle has resolved.
  const profileBase = ownProfileUrl({
    activeGroup: activeOrg,
    personalHandle,
    personalDid,
  })

  return (
    // The container sets the width, gutters and page-frame shell layout;
    // `home-page` scopes the page's own rules in home.css.
    <PageContainer className="home-page">
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
    </PageContainer>
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
  const canCreate = isRouteVisibleToActor("create", isGroup)
  const identity = { did, profile, avatarUrl, handle, isLoading }

  return (
    <>
      <HomeIdentityHeader identity={identity} activeGroup={activeGroup} />

      {/* DOM order is the phone order (ID, records, from others, groups,
          apps); from 1100px a grid puts the ID and groups in a side
          column and Apps under the main column (home.css). */}
      <div className="home__layout">
        <div className="home__id">
          <HomeIdSection identity={identity} isGroup={isGroup} />
        </div>

        <div className="home__main">
          <HomeRecords
            did={did}
            isGroup={isGroup}
            profileBase={profileBase}
            counts={counts}
            countsLoading={countsLoading}
            canCreate={canCreate}
          />
          <HomeReceived
            did={did}
            isGroup={isGroup}
            profileBase={profileBase}
            counts={counts}
            countsLoading={countsLoading}
          />
        </div>

        {isGroup ? null : (
          <div className="home__groups">
            <HomeGroups profileBase={profileBase} />
          </div>
        )}

        <div className="home__apps">
          <HomeApps />
        </div>
      </div>
    </>
  )
}
