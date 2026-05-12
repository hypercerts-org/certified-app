# Notifications — test plan

Manual/behavioral checklist for the notifications feature (`/notifications` page, nav badges, proxy route).

## Authentication

- [ ] Signed-out user visiting `/notifications` redirects to sign-in (same as other auth'd pages)
- [ ] Calling `POST /api/notifications` without a session returns 401
- [ ] After sign-out, the badge count resets to 0 and polling stops
- [ ] After sign-in, the first badge poll fires and the count appears

## Proxy security (AT Protocol service-auth)

- [ ] Client cannot call `POST /api/notifications` without a CSRF-valid request
- [ ] Client sending an `operationName` not in the allowlist gets 400
- [ ] `INDEXER_DID` unset → 503 "Notifications not configured"
- [ ] No admin API key in env; the proxy mints per-request JWTs via `getServiceAuth`
- [ ] JWT is never exposed to the client (server-only, in the upstream fetch)
- [ ] Requesting `first: 1000` is clamped to 100
- [ ] Response headers include `Cache-Control: no-store`
- [ ] Upstream 401/403 from indexer → client sees 502 (not 401 — no session cascade)
- [ ] Upstream 429 preserves `Retry-After`
- [ ] Session expired (OAuth restore fails) → 401 + deleteSession
- [ ] User's PDS down / `getServiceAuth` fails → 502 "Could not mint service-auth token" (session not invalidated)
- [ ] `getServiceAuth` timeout (>5s) → 502 (session still valid)

## Feed rendering

- [ ] Loading: 3 skeleton rows appear on first visit
- [ ] Empty: "No notifications yet" shown when user has no notifications
- [ ] Populated: rows render with avatar, actor handle, reason text, relative time
- [ ] Endorsement, count=1: "@handle endorsed your activity"
- [ ] Endorsement, count>1: "@handle and N others endorsed your activity"
- [ ] Activity-contributor: "@handle listed you as a contributor"
- [ ] Unresolvable author DID falls back to a truncated DID (e.g. `did:plc:abc…wxyz`)
- [ ] Row without a valid `latestRecordUri` renders as a non-clickable div
- [ ] Row with valid URI navigates to the activity detail page on click
- [ ] Row click fires `track("notification_opened", ...)` analytics event

## Read state

- [ ] On page mount, unread notifications have an accent border
- [ ] After a brief moment, the badge clears (optimistic)
- [ ] `markNotificationsSeen` is called once with the newest `sortAt`
- [ ] Unread styling remains visible for the rest of the page session (doesn't flip mid-view)
- [ ] A new notification arriving via `loadMore` with `isRead=false` is added to the unread snapshot

## Pagination

- [ ] Infinite scroll triggers `loadMore` near the bottom of the list
- [ ] `loadMore` appends to the list, keeps `endCursor` and `hasMore` in sync
- [ ] Reaching the end hides the loading skeleton

## Badge (bottom-nav)

- [ ] Badge hidden when count is 0 or not yet loaded
- [ ] Badge shows actual count when 1–98
- [ ] Badge shows "99+" when count >= 99 or `more === true`
- [ ] Badge color is error/accent; aria-label includes "N unread"
- [ ] Polling runs every 60s when tab visible, pauses when hidden, resumes on visible

## Badge (mobile sidebar)

- [ ] Same behavior as bottom-nav badge
- [ ] Displayed inline after the "Notifications" label

## Error handling

- [ ] Indexer down: page shows "Couldn't load notifications" with retry-eligible state
- [ ] GraphQL error with null connection: logs warning, shows empty state (not error)
- [ ] Mark-seen failure: next poll reconciles (no toast, silent recovery)
- [ ] Network error on unread-count poll: badge retains last value, next poll retries

## Deep links

- [ ] Notification row link navigates to `/activity/{did}/{rkey}` for endorsement and contributor reasons
- [ ] Back navigation from activity returns to `/notifications` with scroll position preserved (best-effort)
