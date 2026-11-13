"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { usePageTitle } from "@/lib/navbar-context"
import Card from "@/components/ui/card"
import PageContainer from "@/components/ui/page-container"
import HomeFeed, { FeedPageHeader } from "@/components/home/home-feed"
import HomeFeedSkeleton from "@/components/home/home-feed-skeleton"
import NewsSection from "@/components/right-rail/news-section"

/** DID of the account whose Bluesky posts fill "News from Certified". */
const NEWS_ACTOR_DID = "did:plc:apun3uo5jqm34pxzqq6on754"

/**
 * `/feed` — what is new in the network: activities, projects and
 * endorsements from accounts the viewer follows plus accounts endorsed by
 * the trusted endorsers picked in the filters. The page header comes
 * first, then the feed; at 1100px and wider the filters sit on the left
 * and "News from Certified" on the right (see HomeFeed). Below 1100px the
 * header's Filters button opens the filters in a sheet or dialog.
 * Follows the account the viewer is acting as, like /home.
 */
export default function FeedPage() {
  usePageTitle("Feed")
  const router = useRouter()
  const { isLoading: authLoading, isAuthenticated, did: personalDid } = useAuth()
  const { activeOrg } = useOrg()
  const activeDid = activeOrg?.groupDid || personalDid

  // Signed-in only, like /home: send signed-out visitors to the landing.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/welcome")
    }
  }, [authLoading, isAuthenticated, router])

  if (authLoading || !isAuthenticated || !activeDid) {
    // Same frame as the loaded page, so nothing jumps when it arrives.
    return (
      <PageContainer className="feed-page">
        <FeedPageHeader />
        <div className="feed-layout">
          <div className="feed-layout__main">
            <HomeFeedSkeleton />
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer className="feed-page">
      {/* Keyed on the account so switching account starts a fresh feed
          instead of showing the previous account's items while it loads. */}
      <HomeFeed
        key={activeDid}
        activeDid={activeDid}
        news={
          <Card unpadded className="feed-layout__box feed-page__news">
            <NewsSection actor={NEWS_ACTOR_DID} heading="News from Certified" />
          </Card>
        }
      />
    </PageContainer>
  )
}
