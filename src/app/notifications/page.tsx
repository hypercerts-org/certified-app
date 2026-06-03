"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Bell, AlertCircle } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useNotifications } from "@/lib/notifications-context"
import { usePageTitle } from "@/lib/navbar-context"
import { useNotificationsFeed } from "@/hooks/use-notifications-feed"
import { useManagedNotifications } from "@/hooks/use-managed-notifications"
import { useManagedAuthors } from "@/hooks/use-managed-authors"
import { useManagesAnyGroup } from "@/lib/groups/managed"
import { useIdentityFocus } from "@/hooks/use-identity-focus"
import { markNotificationsSeen, type Notification } from "@/lib/atproto/notifications"
import type { OwnerTag } from "@/lib/atproto/owner-tag"
import { NOTIFICATIONS_AGGREGATION_ENABLED } from "@/lib/utils/config"
import NotificationRow, {
  type NotificationVia,
} from "@/components/notifications/notification-row"
import NotificationRowSkeleton from "@/components/notifications/notification-row-skeleton"
import SegmentedControl from "@/components/ui/segmented-control"
import Select from "@/components/ui/select"
import EmptyState from "@/components/ui/empty-state"

/** A notification paired with the identity it belongs to. `owner` is null
 *  on the personal (non-aggregated) path. */
interface NotificationRowData {
  notification: Notification
  owner: OwnerTag | null
}

function NotificationsContent() {
  usePageTitle("Notifications")
  const { isAuthenticated } = useAuth()
  const { refresh, markOptimisticallyZero } = useNotifications()

  // Aggregate across managed identities only when the flag is on AND the
  // viewer actually owns/admins a group. Otherwise the page is the
  // personal feed, byte-identical to before.
  const managesAnyGroup = useManagesAnyGroup()
  const aggregating = NOTIFICATIONS_AGGREGATION_ENABLED && managesAnyGroup

  // Both hooks are always called (rules of hooks); the inactive one is
  // disabled, so it does no fetch and returns empty.
  const personal = useNotificationsFeed(isAuthenticated && !aggregating)
  const managed = useManagedNotifications(isAuthenticated && aggregating)

  const { identities } = useManagedAuthors()
  const { focus, setFocus, focusedDid, singleGroupFocused, filterOptions, useDropdown } =
    useIdentityFocus(identities)

  // Unify the two sources behind one shape so the snapshot / mark-seen /
  // infinite-scroll machinery below is source-agnostic.
  const rows = useMemo<NotificationRowData[]>(() => {
    if (aggregating) {
      return managed.items.map((it) => ({
        notification: it.notification,
        owner: it.owner,
      }))
    }
    return personal.notifications.map((n) => ({ notification: n, owner: null }))
  }, [aggregating, managed.items, personal.notifications])

  const { isLoading, isLoadingMore, error, hasMore, loadMore } = aggregating
    ? managed
    : personal

  // Apply the identity focus filter (aggregated view only).
  const visibleRows = useMemo<NotificationRowData[]>(() => {
    if (!aggregating || !focusedDid) return rows
    return rows.filter((r) => r.owner?.ownerDid === focusedDid)
  }, [aggregating, focusedDid, rows])

  // The bare Notification[] backing the snapshot + mark-seen logic.
  const notifications = useMemo(
    () => rows.map((r) => r.notification),
    [rows],
  )

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
  //
  // Note: mark-seen stays personal (iss-scoped) even in the aggregated
  // view — group read-state is shared team state we deliberately don't
  // mutate here (see docs/org-identity/indexer-notifications-aggregation.md
  // §6). The aggregated badge may therefore retain group unreads that this
  // action can't clear; that's intended for phase 1.
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
  }, [isLoading, error, visibleRows.length])

  const hasAnyUnread = useMemo(
    () => visibleRows.some((r) => unreadSnapshot.has(r.notification.id)),
    [visibleRows, unreadSnapshot],
  )

  // The focus strip only makes sense once the viewer has groups to focus
  // (managesAnyGroup guarantees identities.length >= 2 when aggregating).
  const showFilter = aggregating && identities.length > 1

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {showFilter ? (
            <div className="notifications-filter">
              {useDropdown ? (
                <Select
                  size="sm"
                  aria-label="Focus"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                >
                  {filterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <SegmentedControl
                  aria-label="Focus"
                  size="md"
                  value={focus}
                  onValueChange={setFocus}
                  options={filterOptions.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                />
              )}
            </div>
          ) : null}

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
              description={error}
            />
          ) : visibleRows.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications yet"
              description="Endorsements and contributor mentions will show up here."
            />
          ) : (
            <div className={`notification-list${hasAnyUnread ? " notification-list--has-unread" : ""}`}>
              {visibleRows.map(({ notification, owner }) => {
                // Show "via {group}" only for group-owned rows in a mixed
                // view — never when a single group is already focused
                // (every row would share it) or for personal rows.
                const via: NotificationVia | null =
                  owner && owner.kind === "group" && owner.group && !singleGroupFocused
                    ? { group: owner.group, role: owner.role }
                    : null
                return (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    wasUnreadOnMount={unreadSnapshot.has(notification.id)}
                    via={via}
                    isGroupOwned={owner?.kind === "group"}
                  />
                )
              })}
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

export default function NotificationsPage() {
  // Suspense boundary required by Next 16: the aggregated path reads
  // useSearchParams() (the ?focus= identity filter, via useIdentityFocus).
  // Without it, static prerender of /notifications bails — mirrors
  // src/app/managed/page.tsx.
  return (
    <Suspense fallback={null}>
      <NotificationsContent />
    </Suspense>
  )
}
