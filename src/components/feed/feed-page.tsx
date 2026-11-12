"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { usePageTitle } from "@/lib/navbar-context"
import Card from "@/components/ui/card"
import LoadingSpinner from "@/components/ui/loading-spinner"
import HomeFeed from "@/components/home/home-feed"
import NewsSection from "@/components/right-rail/news-section"

/** DID of the account whose Bluesky posts fill "News from Certified". */
const NEWS_ACTOR_DID = "did:plc:apun3uo5jqm34pxzqq6on754"

/**
 * `/feed` — what is new in the network: activities, projects and
 * endorsements from accounts the viewer follows plus accounts endorsed by
 * the evaluators picked in the filters. The page starts with the feed; at
 * 1100px and wider the filters sit on the left and "News from Certified"
 * on the right (see HomeFeed).
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
    return (
      <div className="feed-page">
        <div className="feed-page__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  return (
    <div className="feed-page">
      {/* Keyed on the account so switching account starts a fresh feed
          instead of showing the previous account's items while it loads. */}
      <HomeFeed
        key={activeDid}
        activeDid={activeDid}
        news={
          <Card unpadded className="feed-page__news">
            <NewsSection actor={NEWS_ACTOR_DID} heading="News from Certified" />
          </Card>
        }
      />
    </div>
  )
}
