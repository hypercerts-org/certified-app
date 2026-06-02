# Review — implementation, integration / UX lens

Lens: what does a real user see when they land on `/feed`, do all the
nav paths still route correctly, and does the rendered feed read as
one coherent column when several kinds interleave? Read `plan-v2.md` +
`review-decisions.md`, diffed `feat/positioning-redesign..HEAD`,
walked the components, ran the dev server (`/feed` returns HTTP 200,
no server errors in dev log).

---

## Issues

### 1. Empty-state copy collapses two of the three required variants (medium)

`plan-v2.md:434-437` and `review-decisions.md:79-82` both lock the
three-variant empty state:

- signed-out → "Sign in to see your feed."
- signed-in + 0 authors → "Follow people to see their activity here."
- signed-in + authors but 0 events → "No activity from your follows yet."

What `home-feed.tsx:62-72, 101-130` ships:

- Signed-out → sign-in EmptyState ✓
- Signed-in + 0 events → renders **the same** Inbox EmptyState
  ("No activity yet" / "When people you follow create certs or
  endorse others, you'll see it here") **AND** the `NoFollowsHint`
  ("Not following anyone yet? Find people to follow on the Explore
  page.") underneath. There is no branch on `authors.length === 0`.

The primary message ("When people you follow create certs...") is
literally wrong copy for a viewer who follows nobody — and the hint
trails it as a small subordinate row, so the contradiction reads as a
bug, not a fallback. The original plan was clear: branch the EmptyState,
don't stack a hint under a contradictory primary message. The
`useHomeFeedAuthors` hook already returns `authors.length` to make this
branchable.

Recommendation: gate the rendered EmptyState on
`authors.length === 0` vs `authors.length > 0 && events.length === 0`
and pick distinct copy for each, with the "Follow people" CTA living
in the empty-state's `children` slot (`empty-state.tsx:32`) rather
than as a separate hint pinned below.

### 2. Desktop has no nav entry point to `/feed` (medium)

This is a hole in the redesign-era nav, not in this PR — but this PR
makes it actively visible.

- `bottom-nav.tsx:42` (mobile, `< 800px`) — has a Feed icon routing to
  `/feed`. ✓
- `mobile-sidebar.tsx:113` (mobile, hamburger) — has "Feed". ✓
- `desktop-left-rail.tsx:210-222` (desktop, `≥ 800px`) — **no Feed
  entry at all**. Order is Profile → Explore → Endorsements →
  Notifications → Groups → Apps → Settings. The brand link goes to
  the user's own profile (`/profile/<handle>`), not `/feed`.
- `site-drawer.tsx:60` (hamburger on desktop top bar) — has a "Home"
  link to `/home`, **not** `/feed`. `/home/page.tsx` is the empty
  placeholder div left by the redesign.

Net: at `≥ 800px`, the only way an authed user reaches the new home
timeline is by typing `/feed`, opening the legacy `SiteDrawer` and
clicking the unrelated `/home` link (which doesn't get them there),
or via a deep link. Desktop users get the feature with zero
discoverability. Adding `{ href: "/feed", label: "Feed", icon:
Newspaper }` near the top of `authedItems` (`desktop-left-rail.tsx:210`)
would close this. The `SiteDrawer.tsx:60` Home → `/feed` rewrite
(or removal of the stub `/home` route) is also worth doing in the
same change — two paths to two different "home" surfaces will confuse
desktop users moving between drawer-Home and rail-Feed.

DESIGN.md is also stale here: §"Left Rail (desktop)" (line 366) claims
the authed rail starts with "Home, Explore, …". The implemented rail
starts with "Profile, Explore, …". Both the rail and the doc need to
agree, and ideally both should reference `/feed`.

### 3. Hydration-404 events render the unknown-kind fallback ("did something" + raw at:// URI) (low → medium for legibility)

`follower-events.ts:414-417` returns `payload: null` whenever the
hydration lookup yielded no record — i.e. the underlying cert /
collection / award was deleted after `followerEvents` saw it.
`feed-event-card.tsx:120` then dispatches to `UnknownKindBody`, which
renders:

> *{actor display name}* did something  
> at://did:plc:.../app.bsky.feed.post/3l…

That's misleading copy: the actor's kind IS known (we have
`event.kind === "cert.create"`), only the record vanished. Rendering
"did something" plus a monospace at-URI is the right shape for a
truly unknown kind shipped by the server but it's wrong for "we know
what they did, we just can't render it." For v1 this is rare, but
visible — a single deleted cert from a followed creator surfaces as
an orphan card with confusing language.

Two options, equivalent effort:
- In `FeedEventBody`, branch on `event.kind` (the wire kind) before
  falling through to `UnknownKindBody`. For a known kind with null
  payload, render a graceful "{actor} created a cert" / "{actor}
  awarded a badge" line with no detail link and no image. Distinct
  from "unknown kind."
- Filter `payload === null && KNOWN_FEED_EVENT_KINDS.has(kind)` out
  of the rendered list inside `useHomeFeed` and just don't show
  hydration-404 events at all.

Document the choice; either is better than the current "did
something" surface for known-kind-but-deleted.

### 4. `collection.create` cropped-to-square banners may look wrong (low)

`feed-card__image-wrap` (`feed.css:475-482`) enforces `aspect-ratio: 1
/ 1` with `object-fit: cover`. `cert.create` images are 1:1 by lexicon
convention so that wrap is right for them. `collection.create`
banners are not 1:1 — collection lexicons store wide banners.
Cropping a 3:1 banner to square via `cover` produces a meaningless
centered chunk.

Either: omit the image-wrap for `collection.create` (let the body be
title + description, banner-less in the feed), use a separate
`.feed-card__banner-wrap` with a 3:1 aspect ratio, or accept the
square crop and live with it. The plan was silent on this; the
shipped code defaults to cropping. Worth a deliberate decision rather
than an accident.

### 5. `collection.create` placeholder asymmetry with `cert.create` (low)

`CertCreateBody` (`feed-event-card.tsx:158-164`) renders a placeholder
square (Award icon on a gradient background) when `imageUrl` is null.
`CollectionCreateBody` (lines 214-224) just omits the image wrap
entirely when banner is null. In a mixed feed, identical-position
absences look different across kinds — cert-without-image gets a
placeholder, collection-without-banner gets a tighter card. Either
mirror the cert behavior, or drop the cert placeholder too. The
inconsistency reads as "two designs by two people."

### 6. `loadInitial` runs and POSTs to `/api/indexer` even when `authors=[]` (low)

`use-home-feed.ts:138-142` fires `loadInitial` on every `filterKey`
change, including the empty-authors case. `fetchFollowerEvents`
(`follower-events.ts:162-180`) doesn't short-circuit on empty authors
— it POSTs to the proxy and lets the upstream return an empty page.
For signed-out / no-follows visitors that's one wasted request per
page load. Skipping the fetch when `authors.length === 0` (the same
gate the polling effect already uses, line 215) would zero out the
wasted traffic. Not user-visible but cheap to fix.

### 7. `useSocialGraphSync` doesn't read the new `truncated` flag (latent, pre-existing)

The diff in `use-bluesky-follows.ts:11-17` documents that consumers
deriving set arithmetic from `data` "must refuse to act on the result
when this is true" because the diff would return false-negatives.
`use-social-graph-sync.ts:80-98` derives `inBoth`/`onlyCertified`/
`onlyBluesky` from `blueskyDids` and does NOT consult `truncated`.

This is a pre-existing latent bug (the 10k cap was always there, just
silent) and outside the scope of this PR's stated goals. But this PR
now exposes the field publicly without wiring the only legacy
consumer that the new field's own JSDoc warns about. Worth a
follow-up ticket, ideally linked from the truncated comment so it
doesn't drift.

### 8. `KNOWN_FEED_EVENT_KINDS` is exported but the dispatch site doesn't use it (low, cosmetic)

`follower-events.ts:61-67` exports the const tuple + derived type per
review-decision R11, but `feed-event-card.tsx:91-121` open-codes four
string literals in cascading `if`s. The current code is correct, but
adding a new kind to the tuple has zero compile-time signal that the
card needs a new branch. A narrowing function (`isKnownKind`) or an
exhaustive switch over `KnownFeedEventKind` would close that loop;
without it, the constant is data only the proxy reads.

### 9. Skeleton (`ActivityCardSkeleton`) reflows hard when the page is non-cert-heavy (low, deferred-but-worth-noting)

Plan v2 explicitly accepts this: "layout shift on first paint is
acceptable for v1" (`review-decisions.md:81-83`). Noting only because
review-integration round 1 flagged it as a real polish item; in
practice, the first 20 events on a typical follow set will mix kinds,
and three 380-px skeletons collapsing to mixed 70–400px cards is
visible. Deferred per the plan, but worth re-evaluating after a few
days of real use.

---

## Confirmations

### Navigation paths (mobile)

- `bottom-nav.tsx:30` correctly highlights the Feed tab on `/feed`
  and `/feed/*`. Click → `router.push("/feed")` works (verified with
  dev server).
- `mobile-sidebar.tsx:113` "Feed" link goes to `/feed`.
- Both close on navigation (`mobile-sidebar.tsx:69-72`).

### Removed-surface impact

The old `/feed/page.tsx` returned `HomeClient` (`feat/positioning-redesign:src/app/feed/page.tsx`),
which redirected authed users to `/profile/{did}` and unauth users
to `/welcome`. The redirector still exists at
`src/components/landing/home-client.tsx:13-42` — it's used by the
root `/` page, which is its actual purpose. The `/feed` mounting was
vestigial; only this PR has any reference to it (the deletion
comment in `feed-page-client.tsx:8`).

Grep results for `router.push.*feed`, `router.replace.*feed`,
`Link.*"/feed"`, `href="/feed"` across `src/` return only the three
known callers (bottom-nav, mobile-sidebar, and `pathname === "/feed"`
checks in bottom-nav). No deep links elsewhere relied on the redirect
behaviour. The old `/feed → /profile/{did}` jump is gone but nothing
in the tree depends on it.

### Visual states

Walking the rendered output (read of CSS + components, no browser
session for hydrated states):

- **Signed-out empty state.** EmptyState centered, LogIn icon
  (40px stroke 1.2), "Sign in to see your feed" headline, descriptive
  copy. Renders inside `.feed`. Coherent. (`home-feed.tsx:62-72`)
- **Loading state.** Three `ActivityCardSkeleton`s — square image
  block, title bar, two text lines, two pills. Reads as standard
  feed loading. Caveat above re mixed-kind reflow. (lines 53-59)
- **`cert.create` card.** Author byline (avatar + name + handle +
  inline time), action line ("created a cert" + Sparkles icon),
  square image or Award-icon placeholder, serif H2 title, 3-line
  description, all wrapped in a Link to the activity detail. Clean.
  (`feed-event-card.tsx:127-179`)
- **`collection.create` card.** Author byline, action line ("created
  a project/list/portfolio" + FolderOpen icon), banner (cropped to
  square — see issue 4), title, description. No detail link. Less
  visual hierarchy than cert (no terminal link), but works.
  (lines 185-231)
- **`badge.award` card.** Byline, action line "awarded a badge to
  {subject}" with the subject name linking to their profile.
  Optional note in a tinted box. Reads as a small social row inside
  the same card chrome. (lines 99-107, 237-269)
- **`legacy.endorsement` card.** Same as badge.award, copy is
  "endorsed" + Heart icon, never has a note (lines 109-118).
- **Unknown-kind card.** Byline, "did something" with the
  subjectUri rendered in a monospace ellipsised line. Doesn't link
  but tooltips via `title`. Right shape for a truly unknown kind.
  (lines 275-287)
- **Mixed feed.** Each card uses the shared `.feed-card` outer
  (20px vertical padding, hairline border-bottom). Heights vary —
  cert/collection ~380-450px because of the square image; badge/
  endorsement ~120-180px because they're text-only. Variance is
  organic and reads as one column.
- **Warning banner.** `.feed__warning` is a quiet left-bordered tinted
  box above the feed (`feed.css:2305-2313`), `role="status"`. Copy is
  appropriate; oversized message wins when both flags are true.
  (`home-feed.tsx:76-82`) The two warnings share the same visual —
  acceptable trade-off given they share a remedy.
- **Error state.** `EmptyState` with AlertCircle, distinct title
  for `AUTHORS_FILTER_TOO_LARGE`. Reads cleanly. (lines 84-95)

### Empty/error/warning copy review

- "Sign in to see your feed." ✓
- "Sign in to see activity from people you follow." ✓
- "Follow list too large" / "Couldn't load your feed" ✓
- "No activity yet" / "When people you follow create certs or
  endorse others, you'll see it here." ✓ on its own; **mismatched**
  for the "follows nobody yet" case — see issue 1.
- "Not following anyone yet? Find people to follow on the Explore
  page." OK, but redundant alongside the primary message; better
  folded into a "no follows" variant of the primary empty state
  with a real CTA button (see issue 1).
- Warning banners — concise, no jargon. ✓

### Spec / plan adherence

- `plan-v2.md` track structure (8 tracks, sequential) matches
  committed history (8 commits, in plan order).
- `MAX_AUTHORS_FILTER_SIZE = 500` enforced server-side
  (`route.ts:65, 752-756`) and client-side (`follower-events.ts:45`,
  `use-home-feed-authors.ts:23-27`).
- Polling cadence — 30s foreground, 5min background, visibility
  switching (`use-home-feed.ts:213-250`).
- Polling pauses when authors empty — ✓ (line 215).
- `refresh` merges by `event.id` and preserves cursor — ✓ (lines
  179-204).
- Empty `authors: []` accepted by proxy — ✓ (`route.ts:752-756`,
  empty arrays pass through).
- Defense-in-depth client truncation to 500 before sending — ✓
  (`use-home-feed-authors.ts:23-27`).
- `nodeToActivityRecord` / `nodeToCollectionRecord` extracted and
  exported per R6 — ✓ (`indexer.ts` diff).
- Unknown-kind fallback present per R11 — ✓ (mod issue 3 above).

### Build / smoke

- Dev server start + `GET /feed` → HTTP 200 in 41ms, no errors in
  dev log.
- `metadata` export preserved on the server file
  (`feed/page.tsx:4-9`), `"use client"` correctly scoped to
  `feed-page-client.tsx`.
- `usePageTitle("Feed")` registers the navbar title (line 18).

---

## Summary

Spec/data plumbing is solid; the implementation matches plan v2
across all tracks. The two items worth blocking on before merge are
**issue 1** (empty-state copy contradicts itself for the no-follows
case) and **issue 2** (desktop users have no nav entry to the
feature). Issues 3-5 are visible-but-acceptable v1 polish. Issues
6-9 are non-blocking, cheap to track.

Net: this is shipable after fixing the empty-state branch and
either adding a Feed link to the desktop left rail or pointing
`SiteDrawer`'s `/home` link at `/feed`.
