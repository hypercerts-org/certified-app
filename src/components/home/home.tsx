"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import { useActorWorkspaceCounts } from "@/hooks/use-workspace"
import { usePageTitle } from "@/lib/navbar-context"
import { isRouteVisibleToActor } from "@/lib/groups/personal-only"
import { ownProfileUrl } from "@/lib/urls"
import Card from "@/components/ui/card"
import LoadingSpinner from "@/components/ui/loading-spinner"
import HomeFeed from "@/components/home/home-feed"
import HomeAccountCard from "@/components/home/home-account-card"
import {
  HomeApps,
  HomeFeedBlock,
  HomeGroups,
  HomeReceived,
  HomeRecords,
} from "@/components/home/home-sections"
import NewsSection from "@/components/right-rail/news-section"

/** DID of the actor whose Bluesky timeline powers the home page's
 *  "News from Certified" panel. Hard-coded — the source of truth lives in
 *  this component because the home page is its only consumer. */
const NEWS_ACTOR_DID = "did:plc:apun3uo5jqm34pxzqq6on754"

/**
 * Signed-in home: the account first, the feed last.
 *
 *   ≥ 1100px                                 < 1100px (one column)
 *   ┌──────────────┐ ┌──────────────────┐    account card
 *   │ account card │ │ Records          │    Records
 *   │  profile     │ │ From others      │    From others
 *   │  ID          │ │ Apps             │    Apps
 *   ├──────────────┤ │ Your groups      │    Your groups
 *   │ news         │ │ From accounts    │    From accounts you follow
 *   └──────────────┘ │  you follow      │
 *                    └──────────────────┘
 *
 * Everything describes the account the viewer is acting as: the personal
 * account, or the group picked in the account switcher. "Your groups" is
 * the one personal-only section.
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
  const { counts, isLoading: countsLoading } = useActorWorkspaceCounts(activeDid ?? null)

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

  // Spinner while auth resolves, while the signed-out redirect is in
  // flight, or while the acting-as DID is still resolving.
  if (authLoading || !isAuthenticated || !activeDid) {
    return (
      <div className="home-page">
        <div className="home__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  // Same target as the top bar's "My profile": the acting-as identity's
  // handle URL, falling back to its DID so links work before the handle
  // has resolved.
  const profileBase = ownProfileUrl({
    activeGroup: activeOrg,
    personalHandle,
    personalDid,
  })
  const canCreate = isRouteVisibleToActor("create", !!activeOrg)

  return (
    <div className="home-page">
      {/* Keyed on the account: switching account keeps the /home path, so
          without a remount every section would keep showing the previous
          account's profile and records until its refetch landed. */}
      <div className="home__layout" key={activeDid}>
        <div className="home__aside">
          <HomeAccountCard did={activeDid} activeGroup={activeOrg ?? null} />
          {/* NewsSection renders its own named <section>. */}
          <Card className="home__news">
            <NewsSection actor={NEWS_ACTOR_DID} heading="News from Certified" />
          </Card>
        </div>

        <div className="home__main">
          <HomeRecords
            did={activeDid}
            profileBase={profileBase}
            counts={counts}
            countsLoading={countsLoading}
            canCreate={canCreate}
          />
          <HomeReceived
            did={activeDid}
            profileBase={profileBase}
            counts={counts}
            countsLoading={countsLoading}
          />
          <HomeApps />
          {activeOrg ? null : <HomeGroups profileBase={profileBase} />}
          <HomeFeedBlock>
            <HomeFeed activeDid={activeDid} />
          </HomeFeedBlock>
        </div>
      </div>
    </div>
  )
}
