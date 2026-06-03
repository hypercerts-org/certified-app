"use client"

import React from "react"
import Link from "next/link"
import { track } from "@vercel/analytics"
import type { Notification } from "@/lib/atproto/notifications"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { activityDetailHrefFromUri } from "@/lib/atproto/activity-uri"
import { formatRelativeTime } from "@/lib/atproto/activity"
import { BADGE_AWARD_COLLECTION } from "@/lib/atproto/badges"
import { truncateDid } from "@/lib/utils/did"
import { getInitials } from "@/lib/utils/initials"
import Avatar from "@/components/ui/avatar"
import ResponseButtons from "@/components/badges/response-buttons"
import ViaByline from "@/components/ui/via-byline"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import type { Group, OrgRole } from "@/lib/groups/types"

function reasonText(
  notification: Notification,
  displayName: string,
  isHandle: boolean,
): React.ReactNode {
  const { reason, count } = notification
  const actor = <strong>{isHandle ? `@${displayName}` : displayName}</strong>
  if (reason === "endorsement") {
    if (count > 1) {
      const others = count - 1
      return <>{actor} and {others} {others === 1 ? "other" : "others"} endorsed you</>
    }
    return <>{actor} endorsed you</>
  }
  if (reason === "activity-contributor") {
    return <>{actor} listed you as a contributor</>
  }
  return <>{actor} {reason}</>
}

/** Provenance for an aggregated notification owned by a group the viewer
 *  manages — drives the "via {group}" byline. Omitted/null for personal
 *  notifications and whenever a single group is already focused. */
export interface NotificationVia {
  group: Group
  role?: OrgRole
}

interface NotificationRowProps {
  notification: Notification
  /** Snapshot of read state from when the page mounted, so the row
   *  styling stays stable even after mark-seen fires. */
  wasUnreadOnMount: boolean
  /** When set, render a "via {group}" line under the notification text
   *  (aggregated view, group-owned row). */
  via?: NotificationVia | null
  /** True when this notification belongs to a GROUP the viewer manages
   *  (aggregated view). The endorsement accept/reject control is suppressed
   *  for these rows: responding would act as the viewer's PERSONAL account
   *  against an award made to the group — a cross-identity action this
   *  read-aggregation phase deliberately doesn't allow. */
  isGroupOwned?: boolean
}

export default function NotificationRow({
  notification,
  wasUnreadOnMount,
  via = null,
  isGroupOwned = false,
}: NotificationRowProps) {
  const { did: ownerDid } = useAuth()
  // Notifications are the personal account's. While delegated (acting as a
  // group) the accept/reject control is hidden — responding to your personal
  // endorsements while "being" the org is a confusing cross-identity action.
  const { activeOrg } = useOrg()
  const { info } = useAuthorInfo(notification.latestAuthor)
  const hasHandle = Boolean(info?.handle)
  const displayName = info?.handle || truncateDid(notification.latestAuthor)
  const fallbackInitials = getInitials(info?.displayName || info?.handle, notification.latestAuthor)
  const href = activityDetailHrefFromUri(notification.latestRecordUri)
  const absoluteTime = new Date(notification.sortAt).toLocaleString()
  const relativeTime = formatRelativeTime(notification.sortAt)

  // Show response buttons only when the underlying record is a
  // badge.award. Any other notification reason can't be responded to
  // via this control, so we keep the row read-only for it.
  const isBadgeAward = notification.latestRecordUri.includes(
    `/${BADGE_AWARD_COLLECTION}/`,
  )
  const { resolve, invalidate, refetch } = useOwnResponseStates()
  const responseState = isBadgeAward
    ? resolve(notification.latestRecordUri).state
    : "default"

  const handleAfterWrite = async () => {
    invalidate()
    await refetch()
  }

  const content = (
    <>
      <div className="notification-row__avatar">
        <Avatar
          src={info?.avatarUrl || undefined}
          alt=""
          size="sm"
          fallbackInitials={fallbackInitials}
        />
      </div>
      <div className="notification-row__body">
        <p className="notification-row__text">{reasonText(notification, displayName, hasHandle)}</p>
        {via ? <ViaByline group={via.group} role={via.role} /> : null}
        <time
          dateTime={notification.sortAt}
          title={absoluteTime}
          className="notification-row__time"
          suppressHydrationWarning
        >
          {relativeTime}
        </time>
      </div>
      {wasUnreadOnMount && (
        <span className="sr-only">Unread</span>
      )}
    </>
  )

  const className = `notification-row${wasUnreadOnMount ? " notification-row--unread" : ""}`

  // Wrapping in <Link> would put a <button> inside <a>, which is
  // illegal HTML. When we have response buttons to show, drop the
  // outer link and use a div; the link target was just the
  // record-detail page, which the user can still reach by clicking
  // the body text once we add an inner <Link>. For now the badge.
  // award case has no record-detail route anyway (we deep-link to
  // bsky-style activity pages, which don't exist for awards), so
  // dropping the link wrapper here is harmless.
  if (href && !isBadgeAward) {
    return (
      <Link
        href={href}
        className={className}
        onClick={() => track("notification_opened", { reason: notification.reason })}
      >
        {content}
      </Link>
    )
  }
  return (
    <div className={className}>
      {content}
      {isBadgeAward && !activeOrg && !isGroupOwned ? (
        <ResponseButtons
          awardUri={notification.latestRecordUri}
          awardCid={notification.latestRecordCid}
          issuerDisplayName={displayName}
          ownerDid={ownerDid}
          state={responseState}
          onAfterWrite={handleAfterWrite}
        />
      ) : null}
    </div>
  )
}
