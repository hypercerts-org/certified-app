"use client"

import HomeFeed from "@/components/feed/home-feed"
import { useFollowerEventsFeed } from "@/hooks/use-follower-events-feed"
import { usePageTitle } from "@/lib/navbar-context"

/**
 * Home-timeline feed at /feed. Replaces the legacy `HomeClient`
 * redirector that lived here before — adopting magic-indexer's new
 * `followerEvents` field (issue #88) for the home timeline.
 *
 * Renders the union of the viewer's Bluesky + Certified follows'
 * lexicon-level create events (certs, collections, badge awards,
 * legacy endorsements) in one feed, polled every 30s while the tab
 * is visible.
 */
export default function FeedPageClient() {
  usePageTitle("Feed")
  const feed = useFollowerEventsFeed()
  return <HomeFeed {...feed} />
}
