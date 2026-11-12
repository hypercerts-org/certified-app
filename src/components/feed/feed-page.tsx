"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Compass } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import { useFollowing } from "@/hooks/use-following"
import { usePageTitle } from "@/lib/navbar-context"
import { ownProfileUrl } from "@/lib/urls"
import { formatGraphCount } from "@/lib/utils/format-graph-count"
import LoadingSpinner from "@/components/ui/loading-spinner"
import HomeFeed from "@/components/home/home-feed"

/**
 * `/feed` — what the accounts and groups you follow have published lately:
 * a header that says whose feed this is (with the following count and a way
 * to find more accounts), then the follow-graph feed with its filters.
 * Follows the account the viewer is acting as, like /home.
 */
export default function FeedPage() {
  usePageTitle("Feed")
  const router = useRouter()
  const { isLoading: authLoading, isAuthenticated, did: personalDid } = useAuth()
  const { handle: personalHandle } = useSession()
  const { activeOrg } = useOrg()
  const activeDid = activeOrg?.groupDid || personalDid
  const following = useFollowing(activeDid ?? null)

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

  const profileBase = ownProfileUrl({
    activeGroup: activeOrg,
    personalHandle,
    personalDid,
  })
  const showCount = !following.isLoading && !following.error

  return (
    <div className="feed-page">
      <header className="feed-page__header">
        <h2 className="feed-page__title font-headline text-h2">From accounts you follow</h2>
        <p className="feed-page__intro">
          New activities, projects and endorsements from the accounts and
          groups {activeOrg ? "this group follows" : "you follow"}.
        </p>
        <div className="feed-page__meta">
          {showCount ? (
            <Link
              href={`${profileBase}?tab=followers&sub=following`}
              className="feed-page__meta-link"
            >
              Following{" "}
              <span className="feed-page__count">
                {formatGraphCount(following.count, following.truncated)}
              </span>
            </Link>
          ) : null}
          <Link href="/explore" className="feed-page__meta-link">
            <Compass size={14} strokeWidth={1.75} aria-hidden />
            Find accounts to follow
          </Link>
        </div>
      </header>

      {/* Keyed on the account so switching account starts a fresh feed
          instead of showing the previous account's items while it loads. */}
      <div className="feed-page__feed" data-tour="feed">
        <HomeFeed key={activeDid} activeDid={activeDid} />
      </div>
    </div>
  )
}
