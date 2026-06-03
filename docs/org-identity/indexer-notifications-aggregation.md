# magic-indexer spec — notifications aggregation for managed identities

**Status:** proposed (client built against this contract, flag-gated OFF)
**Owner (client side):** certified-app `feat/org-identity-aggregation`
**Blocks:** the "Notifications" slice of the org-identity aggregation model
**Client flag:** `NEXT_PUBLIC_NOTIFICATIONS_AGGREGATION` (default `false`)

---

## 1. Why

certified-app now aggregates records *owned by groups a user owns/admins*
onto that user's work surfaces (Home, the `/managed` hub, the own-profile
bridge). Projects and activities already aggregate, because their indexer
ops (`fetchProjects`, `fetchIndexerActivities`) accept a multi-author
`authors: [String!]` filter.

**Notifications are the one surface that cannot aggregate from the client
alone.** The notifications op is scoped *entirely* by the service-auth JWT
`iss` claim minted server-side (`src/app/api/notifications/route.ts`):

```
iss  = user's DID            (from the OAuth agent / PDS signature)
aud  = INDEXER_DID
lxm  = "com.hypergoat.notification.query"
```

The `notifications` and `unreadNotificationCount` queries take **no
recipient/subject parameter** — the indexer derives "whose notifications"
from `iss`. So a user who owns *Estuary Alliance* has no way to see "your
group was endorsed" notifications without acting as the group DID.

We deliberately do **not** want to mint a separate `iss = groupDID` JWT per
group and fan out (N round-trips, and it requires group signing authority
the app proxy doesn't cleanly expose for read ops). Instead we ask the
indexer to authorize *one* call — `iss = user` — to read notifications for a
set of **recipients** the indexer's own role index confirms the user
owns/admins.

## 2. What changes (summary)

1. Add an optional `recipients: [String!]` argument to **`notifications`**
   and **`unreadNotificationCount`**.
2. Add a non-null `recipient: String!` field to the **notification node**.
3. Authorize each requested recipient against the indexer's role index:
   the `iss` may read a recipient's notifications iff
   `recipient == iss` **or** `iss` is an `owner`/`admin` of `recipient`.
   Silently drop unauthorized recipients (see §5).

All three are **additive and backward-compatible**: when `recipients` is
omitted or empty, behaviour is byte-identical to today (iss-only). The
client only sends `recipients` when its feature flag is on, so production
traffic is unchanged until the indexer ships this.

## 3. GraphQL schema (exact)

### 3.1 `notifications`

```graphql
type Query {
  notifications(
    first: Int!
    after: String
    "Optional. DIDs whose notifications to include. Omitted/empty = the
     authenticated DID only (current behaviour). Every DID is authorized
     against the caller's owner/admin role; unauthorized DIDs are dropped."
    recipients: [String!]
  ): NotificationConnection!
}
```

### 3.2 `unreadNotificationCount`

```graphql
type Query {
  unreadNotificationCount(
    "Same semantics + authorization as notifications.recipients."
    recipients: [String!]
  ): UnreadCount!
}
```

### 3.3 Notification node — add `recipient`

```graphql
type Notification {
  id: ID!
  reason: String!              # "endorsement" | "activity-contributor"
  reasonSubject: String
  sortAt: String!
  count: Int!
  latestRecordUri: String!
  latestRecordCid: String!
  latestAuthor: String!
  isRead: Boolean!
  "NEW: the DID whose notification this is (== iss when recipients omitted).
   The client uses this to tag aggregated rows 'via {group}'. Always present."
  recipient: String!
}
```

`recipient` is what lets the client label a row without re-parsing
`reasonSubject` URIs. In the non-aggregated path it simply equals `iss`.

## 4. Server-side query strings the client will send

The Next.js route holds the query strings (the client sends only
`operationName` + `variables`). When the flag is on **and** `recipients` is
non-empty, the route sends these **variant** queries (note the new arg +
`recipient` selection). When the flag is off, it sends today's queries
unchanged.

```graphql
query notifications($first: Int!, $after: String, $recipients: [String!]) {
  notifications(first: $first, after: $after, recipients: $recipients) {
    edges { cursor node {
      id reason reasonSubject sortAt count
      latestRecordUri latestRecordCid latestAuthor isRead recipient
    } }
    pageInfo { hasNextPage endCursor }
  }
}

query unreadNotificationCount($recipients: [String!]) {
  unreadNotificationCount(recipients: $recipients) { count more }
}
```

## 5. Authorization model

The indexer already ingests group membership / role records (it powers
`resolveGroups` and the org role badges). Reuse that index — **do not**
trust a client-supplied role.

For a request with `iss = U` and `recipients = [R1, R2, …]`:

- Always allow `Ri == U`.
- Allow `Ri != U` iff the role index says `U` is `owner` or `admin` of
  `Ri`. `member` is **not** sufficient (mirrors the client's
  `ownedOrAdminGroups` filter — member-role records are excluded from
  aggregation everywhere).
- **Drop** unauthorized `Ri` from the result set silently rather than
  erroring the whole request. Rationale: membership is eventually
  consistent; a just-revoked admin shouldn't get a 4xx that blanks their
  entire notification feed — they should just stop seeing that group's
  rows. (The client re-derives the authorized author set from the same
  role data on every poll, so the two converge.)
- If, after dropping, the effective recipient set is empty, fall back to
  `[U]` (never return a foreign-only or empty-authorized set as "all").

> Optional, nice-to-have for observability: a top-level
> `unauthorizedRecipients: [String!]` on the connection so the client can
> warn in dev. Not required for v1.

## 6. Read-state / "seen" boundary (phase 1)

`updateNotificationsSeen(seenAt)` stays **iss-scoped (personal only)** in
this phase. It is intentionally *not* extended with `recipients`:

- "Seen" for a group is **shared team state** — if one admin marks the
  group's notifications seen, it clears the badge for every other admin.
  That is a real product decision (per-user vs per-group read state) we are
  not making under a flag.
- Therefore the aggregated **unread count** may include group
  notifications that no per-group "seen" action can currently clear. The
  client accounts for this: the aggregated badge is informational; marking
  seen only ever affects the user's personal notifications.

Phase 2 (future, out of scope here): per-(user, recipient) seen cursors so
each admin has independent group read-state. Flagged separately when we get
there.

## 7. JWT / transport — unchanged

- Same endpoint: `POST {INDEXER_URL_BASE}/notifications/graphql`.
- Same `lxm = "com.hypergoat.notification.query"`, same `aud = INDEXER_DID`,
  same ~60s `exp`, same `jti` replay cache.
- `iss` is still the **user** DID. The recipients authorization is the only
  new server-side logic. No new lexicon method, no group-issued JWTs.

## 8. Client integration points (already built, flag-gated)

When `NEXT_PUBLIC_NOTIFICATIONS_AGGREGATION=true`:

| Concern | File | Behaviour |
| --- | --- | --- |
| Flag | `src/lib/utils/config.ts` | `NOTIFICATIONS_AGGREGATION_ENABLED` |
| Client op | `src/lib/atproto/notifications.ts` | `fetchNotifications`/`fetchUnreadCount` send `recipients`, parse `recipient` |
| Route | `src/app/api/notifications/route.ts` | validates `recipients` (DID-shaped, ≤ `MAX_RECIPIENTS`), selects the variant query only when flag on + recipients present |
| Feed hook | `src/hooks/use-managed-notifications.ts` | fans out via `useManagedAuthors().authors`, tags each row with `ownerTagForDid(recipient, …)` |
| Count | `src/lib/notifications-context.tsx` | aggregated unread badge across managed recipients |
| UI | `src/app/notifications/page.tsx` | identity focus filter + "via {group}" byline, exactly like the `/managed` hub |

Recommended rollout: ship the indexer change to dev → set the flag on the
certified-app **preview** env only → verify against real data → set on
staging → production.

## 9. Acceptance checklist (indexer side)

- [ ] `notifications(recipients: [])` and `notifications` (no arg) return
      byte-identical results to today for the same `iss`.
- [ ] `notifications(recipients: [iss])` == today.
- [ ] `notifications(recipients: [iss, ownedGroup])` returns the union,
      each node carrying the correct `recipient`.
- [ ] `notifications(recipients: [groupUserOnlyMemberOf])` drops that DID
      (returns iss-only), no error.
- [ ] `notifications(recipients: [strangerDid])` drops it, no error, no
      leak of the stranger's notifications.
- [ ] `unreadNotificationCount(recipients: …)` mirrors the same authz.
- [ ] `recipient` is present and correct on every node in all paths.
- [ ] `updateNotificationsSeen` unchanged (iss-only).
