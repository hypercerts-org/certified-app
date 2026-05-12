"use client"

const PROXY_URL = "/api/notifications"

export type NotificationReason = "endorsement" | "activity-contributor"

export interface Notification {
  id: string
  reason: NotificationReason
  reasonSubject: string | null
  sortAt: string
  count: number
  latestRecordUri: string
  latestRecordCid: string
  latestAuthor: string
  isRead: boolean
}

export interface NotificationsPage {
  records: Notification[]
  hasMore: boolean
  endCursor: string | null
}

export interface UnreadCount {
  count: number
  more: boolean
}

interface ProxyResponse<T> {
  data?: T | null
  errors?: { message: string }[]
}

/** Safely parse a notifications GraphQL response into a page. Skips
 *  malformed edges with a console warning. */
function parseNotificationsPage(json: ProxyResponse<{
  notifications?: {
    edges: { cursor: string; node: Notification | null }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  } | null
}>): NotificationsPage {
  const connection = json.data?.notifications
  if (!connection) {
    if (json.errors?.length) {
      console.warn("[Notifications] GraphQL error:", json.errors[0].message)
    }
    return { records: [], hasMore: false, endCursor: null }
  }
  const records: Notification[] = []
  for (const edge of connection.edges) {
    const n = edge.node
    if (!n || typeof n.reason !== "string" || !n.sortAt || !n.id) {
      console.warn("[Notifications] skipping malformed edge")
      continue
    }
    records.push(n)
  }
  return {
    records,
    hasMore: connection.pageInfo.hasNextPage,
    endCursor: connection.pageInfo.endCursor,
  }
}

export class NotificationsUnauthenticatedError extends Error {
  constructor() {
    super("Notifications: not authenticated")
    this.name = "NotificationsUnauthenticatedError"
  }
}

async function callProxy<T>(
  operationName: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ProxyResponse<T>> {
  // Use plain fetch (not authFetch) so a notifications-specific 401
  // never invalidates the user's global auth state. Notifications are
  // best-effort and must not disturb the session.
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationName, variables }),
    signal,
  })
  if (res.status === 401) {
    // Expected state when the user's session is missing or expired.
    // We use plain fetch (not authFetch) so this 401 never invalidates
    // the user's global auth state — callers surface the typed error
    // and handle their own reset.
    throw new NotificationsUnauthenticatedError()
  }
  if (!res.ok) {
    throw new Error(`Notifications request failed: ${res.status}`)
  }
  return res.json() as Promise<ProxyResponse<T>>
}

export async function fetchNotifications(options: {
  first?: number
  after?: string | null
  signal?: AbortSignal
} = {}): Promise<NotificationsPage> {
  const { first = 50, after, signal } = options
  const json = await callProxy<{
    notifications?: {
      edges: { cursor: string; node: Notification | null }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  }>("notifications", { first, after: after ?? null }, signal)
  return parseNotificationsPage(json)
}

export async function fetchUnreadCount(signal?: AbortSignal): Promise<UnreadCount> {
  const json = await callProxy<{
    unreadNotificationCount?: { count: number; more: boolean } | null
  }>("unreadNotificationCount", {}, signal)
  const u = json.data?.unreadNotificationCount
  if (!u) {
    if (json.errors?.length) {
      throw new Error(json.errors[0].message)
    }
    throw new Error("Unread count unavailable")
  }
  return { count: u.count, more: u.more }
}

export async function markNotificationsSeen(
  seenAt: string = new Date().toISOString(),
  signal?: AbortSignal,
): Promise<void> {
  await callProxy("updateNotificationsSeen", { seenAt }, signal)
}
