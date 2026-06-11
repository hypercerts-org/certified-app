"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bell, AlertCircle } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useNotifications } from "@/lib/notifications-context"
import { usePageTitle } from "@/lib/navbar-context"
import { useNotificationsFeed } from "@/hooks/use-notifications-feed"
import { markNotificationsSeen } from "@/lib/atproto/notifications"
import NotificationRow from "@/components/notifications/notification-row"
import NotificationRowSkeleton from "@/components/notifications/notification-row-skeleton"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"

export default function NotificationsPage() {
  usePageTitle("Notifications")
  const { isAuthenticated } = useAuth()
  const { refresh, markOptimisticallyZero } = useNotifications()
  const { notifications, isLoading, isLoadingMore, error, hasMore, loadMore, retry } =
    useNotificationsFeed(isAuthenticated)

  // Snapshot unread state on first load so rows don't visually flip
  // to read mid-session after mark-seen fires.
  const [unreadSnapshot, setUnreadSnapshot] = useState<Set<string>>(new Set())
  const snapshotTakenRef = useRef(false)
  useEffect(() => {
    if (!snapshotTakenRef.current && !isLoading && notifications.length > 0) {
      snapshotTakenRef.current = true
      setUnreadSnapshot(new Set(notifications.filter(n => !n.isRead).map(n => n.id)))
    }
  }, [isLoading, notifications])

  // Notifications that arrive later (via loadMore or future poll) with
  // isRead=false should still be treated as unread for this visit.
  useEffect(() => {
    if (!snapshotTakenRef.current) return
    setUnreadSnapshot(prev => {
      let changed = false
      const next = new Set(prev)
      for (const n of notifications) {
        if (!n.isRead && !next.has(n.id)) {
          next.add(n.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [notifications])

  // Fire mark-seen once after the initial load lands. Optimistic badge
  // zero; on failure, refresh() reconciles with the true value.
  const markedRef = useRef(false)
  const notificationsRef = useRef(notifications)
  useEffect(() => { notificationsRef.current = notifications }, [notifications])
  useEffect(() => {
    if (markedRef.current) return
    if (!isAuthenticated || isLoading || error) return
    if (notificationsRef.current.length === 0) return
    markedRef.current = true
    const seenAt = notificationsRef.current[0].sortAt
    markOptimisticallyZero()
    markNotificationsSeen(seenAt)
      .then(() => refresh())
      .catch(() => {
        refresh()
      })
  }, [isAuthenticated, isLoading, error, markOptimisticallyZero, refresh])

  // IntersectionObserver for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef(loadMore)
  const hasMoreRef = useRef(hasMore)
  const isLoadingMoreRef = useRef(isLoadingMore)
  useEffect(() => { loadMoreRef.current = loadMore }, [loadMore])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore }, [isLoadingMore])

  useEffect(() => {
    if (isLoading || error) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMoreRef.current && !isLoadingMoreRef.current) {
          loadMoreRef.current()
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [isLoading, error, notifications.length])

  const hasAnyUnread = useMemo(() => unreadSnapshot.size > 0, [unreadSnapshot])

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {isLoading ? (
            <div className="notification-list">
              <NotificationRowSkeleton />
              <NotificationRowSkeleton />
              <NotificationRowSkeleton />
            </div>
          ) : error ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load notifications"
              description={`${error} Please check your connection and try again.`}
            >
              <Button variant="secondary" onClick={retry}>
                Retry
              </Button>
            </EmptyState>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications yet"
              description="Endorsements and contributor mentions will show up here."
            />
          ) : (
            <div className={`notification-list${hasAnyUnread ? " notification-list--has-unread" : ""}`}>
              {notifications.map(n => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  wasUnreadOnMount={unreadSnapshot.has(n.id)}
                />
              ))}
              <div ref={sentinelRef} className="notification-list__sentinel">
                {isLoadingMore && <NotificationRowSkeleton />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
