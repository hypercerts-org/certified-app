"use client"

import React from "react"
import Link from "next/link"
import { track } from "@vercel/analytics"
import type { Notification } from "@/lib/atproto/notifications"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { activityDetailHrefFromUri } from "@/lib/atproto/activity-uri"
import { formatRelativeTime } from "@/lib/atproto/activity"
import Avatar from "@/components/ui/avatar"

function truncateDid(did: string): string {
  if (did.length <= 24) return did
  return `${did.slice(0, 16)}…${did.slice(-4)}`
}

function reasonText(
  notification: Notification,
  displayName: string,
  isHandle: boolean,
): React.ReactNode {
  const { reason, count } = notification
  const actor = <strong>{isHandle ? `@${displayName}` : displayName}</strong>
  if (reason === "endorsement") {
    if (count > 1) {
      return <>{actor} and {count - 1} others endorsed you</>
    }
    return <>{actor} endorsed you</>
  }
  if (reason === "activity-contributor") {
    return <>{actor} listed you as a contributor</>
  }
  return <>{actor} {reason}</>
}

interface NotificationRowProps {
  notification: Notification
  /** Snapshot of read state from when the page mounted, so the row
   *  styling stays stable even after mark-seen fires. */
  wasUnreadOnMount: boolean
}

export default function NotificationRow({ notification, wasUnreadOnMount }: NotificationRowProps) {
  const { info } = useAuthorInfo(notification.latestAuthor)
  const hasHandle = Boolean(info?.handle)
  const displayName = info?.handle || truncateDid(notification.latestAuthor)
  const fallbackInitials = info?.displayName?.slice(0, 2) || info?.handle?.slice(0, 2) || "??"
  const href = activityDetailHrefFromUri(notification.latestRecordUri)
  const absoluteTime = new Date(notification.sortAt).toLocaleString()
  const relativeTime = formatRelativeTime(notification.sortAt)

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

  if (href) {
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
  return <div className={className}>{content}</div>
}
