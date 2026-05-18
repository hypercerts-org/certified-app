"use client"

import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"

interface CertHeadlineBylineProps {
  /** DID of the cert's author. */
  did: string
  /** ISO `createdAt` string for the cert — rendered to the left of "by". */
  createdAt: string
  /** Pre-formatted absolute date, e.g. "May 7, 2026". Avoids duplicating
   *  the formatter that ActivityDetail already runs. */
  formattedDate: string
}

/**
 * Cert detail byline that sits under the title in the main pane.
 *
 * Layout (mobile + desktop are the same — short enough to stay on one
 * line below ~360 px):
 *
 *   <date>  by  <avatar>  <display name>
 *                         @<handle>
 *
 * The avatar + name stack share a single link target. The handle sits
 * muted under the display name as a second line, matching the byline
 * used on the feed cards (`.feed-card__author`).
 */
export default function CertHeadlineByline({
  did,
  createdAt,
  formattedDate,
}: CertHeadlineBylineProps) {
  const { info, isLoading } = useAuthorInfo(did)

  return (
    <div className="cert-detail__headline-byline">
      <span className="cert-detail__headline-label">Created:</span>
      <time
        dateTime={createdAt}
        className="cert-detail__headline-date"
        title={createdAt}
      >
        {formattedDate}
      </time>
      <span className="cert-detail__headline-by">by</span>

      {isLoading || !info ? (
        <span
          className="cert-detail__headline-author cert-detail__headline-author--skeleton"
          aria-hidden="true"
        >
          <span className="cert-detail__headline-avatar-skel" />
          <span className="cert-detail__headline-author-meta">
            <span className="cert-detail__headline-name-skel" />
            <span className="cert-detail__headline-handle-skel" />
          </span>
        </span>
      ) : (
        (() => {
          const displayName = info.displayName || info.handle || "Anonymous"
          const initials = getInitials(info.displayName, did)
          const profileHref = `/profile/${encodeURIComponent(info.handle || did)}`
          return (
            <Link
              href={profileHref}
              className="cert-detail__headline-author"
              aria-label={`View ${displayName}'s profile`}
            >
              <Avatar
                size="sm"
                src={info.avatarUrl || undefined}
                alt=""
                fallbackInitials={initials}
              />
              <span className="cert-detail__headline-author-meta">
                <span className="cert-detail__headline-name">
                  {displayName}
                </span>
                {info.handle ? (
                  <span className="cert-detail__headline-handle">
                    @{info.handle}
                  </span>
                ) : null}
              </span>
            </Link>
          )
        })()
      )}
    </div>
  )
}
