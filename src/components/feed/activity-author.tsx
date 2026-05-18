"use client"

import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"

interface ActivityAuthorProps {
  /** DID of the user who created the activity claim. */
  did: string
}

/**
 * Author byline for an activity card — avatar + display name + @handle,
 * wrapped in a link to the author's profile page. Same compact layout
 * as a post byline in a social feed (Twitter / Bluesky / Mastodon).
 *
 * Resolves the author's Bluesky profile on mount via a module-level
 * cache, so the same author appearing in multiple feed cards only
 * triggers one network request.
 */
export default function ActivityAuthor({ did }: ActivityAuthorProps) {
  const { info, isLoading } = useAuthorInfo(did)

  // Skeleton while the resolve request is in flight. Keeps the card
  // layout stable so titles don't jump when the byline populates.
  if (isLoading || !info) {
    return (
      <div className="feed-card__author feed-card__author--skeleton" aria-hidden="true">
        <div className="feed-card__author-avatar-skel" />
        <div className="feed-card__author-meta">
          <div className="feed-card__author-name-skel" />
          <div className="feed-card__author-handle-skel" />
        </div>
      </div>
    )
  }

  const displayName = info.displayName || info.handle || "Anonymous"
  const initials = getInitials(info.displayName, did)
  const profileHref = `/profile/${encodeURIComponent(info.handle || did)}`

  return (
    <Link
      href={profileHref}
      className="feed-card__author"
      aria-label={`View ${displayName}'s profile`}
      // Prevent parent card click handlers from also firing if a future
      // card-wide link is added.
      onClick={(e) => e.stopPropagation()}
    >
      <Avatar
        size="sm"
        src={info.avatarUrl || undefined}
        alt=""
        fallbackInitials={initials}
        className="shrink-0"
      />
      <span className="feed-card__author-meta">
        <span className="feed-card__author-name">{displayName}</span>
        {info.handle ? (
          <span className="feed-card__author-handle">@{info.handle}</span>
        ) : null}
      </span>
    </Link>
  )
}
